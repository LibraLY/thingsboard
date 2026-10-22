package org.thingsboard.server.config;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import org.springframework.security.oauth2.client.oidc.authentication.OidcIdTokenDecoderFactory;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtDecoderFactory;

/** Deterministic real signatures/JWKS tests; no cloud tokens or credentials. */
public class CloudSupabaseOidcConfigurationTest {
    private static final String CLIENT = "test-registered-cloud-client";
    private static final String REGISTRATION = "test-registered-tb-entity";
    private static int assertions;

    private static ClientRegistration cloudRegistration() {
        String issuer = CloudSupabaseOidcConfiguration.ISSUER;
        return ClientRegistration.withRegistrationId(REGISTRATION).clientId(CLIENT)
                .clientAuthenticationMethod(ClientAuthenticationMethod.NONE)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("http://localhost:8080/login/oauth2/code/").scope("openid", "email", "profile")
                .authorizationUri(issuer + "/oauth/authorize").tokenUri(issuer + "/oauth/token")
                .jwkSetUri(issuer + "/.well-known/jwks.json").userInfoUri(issuer + "/oauth/userinfo")
                .userNameAttributeName("sub").build();
    }

    private static String token(ECKey key, String issuer, String audience, Instant expires) throws Exception {
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(key.getKeyID()).type(JOSEObjectType.JWT).build(),
                claims(issuer, audience, expires));
        jwt.sign(new ECDSASigner(key));
        return jwt.serialize();
    }

    private static JWTClaimsSet claims(String issuer, String audience, Instant expires) {
        return new JWTClaimsSet.Builder().issuer(issuer).subject("explicit-subject").audience(audience)
                .issueTime(new Date()).expirationTime(Date.from(expires)).claim("nonce", "test-nonce").build();
    }

    private static void rejects(String label, Runnable action) {
        try { action.run(); } catch (RuntimeException expected) { assertions++; return; }
        throw new AssertionError("Expected rejection: " + label);
    }

    public static void main(String[] args) throws Exception {
        ECKey ec = new ECKeyGenerator(Curve.P_256).keyID("trusted-ec").generate();
        ECKey attacker = new ECKeyGenerator(Curve.P_256).keyID("trusted-ec").generate();
        RSAKey rsa = new RSAKeyGenerator(2048).keyID("trusted-rsa").generate();
        byte[] jwks = new JWKSet(List.of(ec.toPublicJWK(), rsa.toPublicJWK())).toString().getBytes(StandardCharsets.UTF_8);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/jwks", exchange -> { exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, jwks.length); exchange.getResponseBody().write(jwks); exchange.close(); });
        server.start();
        try {
            String localJwks = "http://127.0.0.1:" + server.getAddress().getPort() + "/jwks";
            OidcIdTokenDecoderFactory ecFactory = new OidcIdTokenDecoderFactory();
            ecFactory.setJwsAlgorithmResolver(registration -> SignatureAlgorithm.ES256);
            // Replace only test network transport; production matching and all
            // Spring OIDC/crypto validators run unchanged on generated tokens.
            JwtDecoderFactory<ClientRegistration> testTransport = registration -> ecFactory.createDecoder(
                    ClientRegistration.withClientRegistration(registration).jwkSetUri(localJwks).build());
            JwtDecoderFactory<ClientRegistration> factory = CloudSupabaseOidcConfiguration.createFactory(
                    CLIENT, REGISTRATION, testTransport, new OidcIdTokenDecoderFactory());
            ClientRegistration registration = cloudRegistration();
            JwtDecoder decoder = factory.createDecoder(registration);
            String issuer = CloudSupabaseOidcConfiguration.ISSUER;
            Instant future = Instant.now().plusSeconds(300);
            if (!"explicit-subject".equals(decoder.decode(token(ec, issuer, CLIENT, future)).getSubject())) throw new AssertionError();
            assertions++;
            String wrongIssuer = token(ec, "https://another.supabase.co/auth/v1", CLIENT, future);
            rejects("wrong issuer", () -> decoder.decode(wrongIssuer));
            String wrongAudience = token(ec, issuer, "another-client", future);
            rejects("wrong audience", () -> decoder.decode(wrongAudience));
            String wrongSignature = token(attacker, issuer, CLIENT, future);
            rejects("wrong signature", () -> decoder.decode(wrongSignature));
            String expired = token(ec, issuer, CLIENT, Instant.now().minusSeconds(120));
            rejects("expired", () -> decoder.decode(expired));
            rejects("wrong configured endpoint", () -> factory.createDecoder(ClientRegistration.withClientRegistration(registration)
                    .jwkSetUri("http://untrusted.invalid/jwks").build()));
            rejects("wrong configured client", () -> factory.createDecoder(ClientRegistration.withClientRegistration(registration)
                    .clientId("another-client").build()));
            rejects("wrong configured registration", () -> factory.createDecoder(ClientRegistration.withClientRegistration(registration)
                    .registrationId("another-registration").build()));
            ClientRegistration other = ClientRegistration.withClientRegistration(registration).registrationId("another-registration")
                    .clientId("another-client").jwkSetUri(localJwks).issuerUri("https://other.example.test").build();
            JwtDecoder otherDecoder = factory.createDecoder(other);
            SignedJWT rsaToken = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(rsa.getKeyID()).build(),
                    claims("https://other.example.test", "another-client", future));
            rsaToken.sign(new RSASSASigner(rsa));
            otherDecoder.decode(rsaToken.serialize()); assertions++;
            String unexpectedEC = token(ec, "https://other.example.test", "another-client", future);
            rejects("other client still requires RSA", () -> otherDecoder.decode(unexpectedEC));
            System.out.println("Cloud OIDC decoder: " + assertions + " real signature and identity assertions passed");
        } finally { server.stop(0); }
    }
}
