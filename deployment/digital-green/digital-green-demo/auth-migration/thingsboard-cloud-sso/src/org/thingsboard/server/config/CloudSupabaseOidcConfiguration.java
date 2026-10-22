package org.thingsboard.server.config;

import java.util.Objects;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.client.oidc.authentication.OidcIdTokenDecoderFactory;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoderFactory;

/** Native Spring OIDC compatibility for the explicitly registered Supabase client. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "TB_SUPABASE_OAUTH_ENABLED", havingValue = "true")
public class CloudSupabaseOidcConfiguration {
    static final String ISSUER = "https://johlcaojlxkmwyjdftke.supabase.co/auth/v1";

    @Bean
    public JwtDecoderFactory<ClientRegistration> cloudIdTokenDecoderFactory(
            @Value("${TB_SUPABASE_OAUTH_CLIENT_ID}") String clientId,
            @Value("${TB_SUPABASE_OAUTH_REGISTRATION_ID}") String registrationId) {
        OidcIdTokenDecoderFactory cloud = new OidcIdTokenDecoderFactory();
        cloud.setJwsAlgorithmResolver(registration -> SignatureAlgorithm.ES256);
        LoggerFactory.getLogger(CloudSupabaseOidcConfiguration.class).info(
                "Pinned Supabase ES256 OIDC decoder registered; default claim validators and other providers retained");
        // Keep Spring's default OIDC required-claim, issuer, audience, azp and
        // timestamp validators. AuthenticationProvider still validates nonce;
        // the existing authorization request resolver still enforces PKCE.
        return createFactory(clientId, registrationId, cloud, new OidcIdTokenDecoderFactory());
    }

    static JwtDecoderFactory<ClientRegistration> createFactory(
            String clientId, String registrationId,
            JwtDecoderFactory<ClientRegistration> cloud,
            JwtDecoderFactory<ClientRegistration> defaults) {
        if (clientId == null || clientId.isBlank() || registrationId == null || registrationId.isBlank()) {
            throw new IllegalArgumentException("Explicit Supabase OAuth client and registration IDs are required");
        }
        return registration -> {
            boolean selected = clientId.equals(registration.getClientId())
                    || registrationId.equals(registration.getRegistrationId());
            if (!selected) {
                // Other configured providers retain the unmodified RS256 default.
                return defaults.createDecoder(registration);
            }
            var provider = registration.getProviderDetails();
            if (!clientId.equals(registration.getClientId())
                    || !registrationId.equals(registration.getRegistrationId())
                    || !Objects.equals(provider.getAuthorizationUri(), ISSUER + "/oauth/authorize")
                    || !Objects.equals(provider.getTokenUri(), ISSUER + "/oauth/token")
                    || !Objects.equals(provider.getJwkSetUri(), ISSUER + "/.well-known/jwks.json")
                    || !Objects.equals(provider.getUserInfoEndpoint().getUri(), ISSUER + "/oauth/userinfo")
                    || (provider.getIssuerUri() != null && !ISSUER.equals(provider.getIssuerUri()))
                    || !ClientAuthenticationMethod.NONE.equals(registration.getClientAuthenticationMethod())
                    || !registration.getScopes().contains("openid")) {
                throw new OAuth2AuthenticationException(new OAuth2Error("invalid_client_configuration",
                        "Supabase OAuth registration does not match its pinned client and endpoints", null));
            }
            // TB's repository omits issuerUri. Supply the trusted fixed issuer so
            // the default Spring OIDC validator can enforce exact issuer matching.
            ClientRegistration trusted = ClientRegistration.withClientRegistration(registration)
                    .issuerUri(ISSUER).build();
            return cloud.createDecoder(trusted);
        };
    }
}
