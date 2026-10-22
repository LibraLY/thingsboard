FROM thingsboard/tb-node:4.3.1.6@sha256:36ffc61305a5d811e167c95bdb1ae452e55588e43bfdce7040467a8c25f3ef5a AS compile
USER root
WORKDIR /cloud-build
RUN jar xf /usr/share/thingsboard/bin/thingsboard.jar BOOT-INF/lib
COPY src/ ./src/
COPY test/ ./test/
RUN mkdir classes tests && javac --release 17 -cp 'BOOT-INF/lib/*' -d classes src/org/thingsboard/server/config/CloudSupabaseOidcConfiguration.java && javac --release 17 -cp 'BOOT-INF/lib/*:classes' -d tests test/org/thingsboard/server/config/CloudSupabaseOidcConfigurationTest.java && java -cp 'BOOT-INF/lib/*:classes:tests' org.thingsboard.server.config.CloudSupabaseOidcConfigurationTest && jar --create --file /cloud-sso.jar -C classes .

FROM thingsboard/tb-node:4.3.1.6@sha256:36ffc61305a5d811e167c95bdb1ae452e55588e43bfdce7040467a8c25f3ef5a
COPY --from=compile /cloud-sso.jar /usr/share/thingsboard/extensions/cloud-sso.jar
ENV LOADER_PATH=/usr/share/thingsboard/extensions/cloud-sso.jar
