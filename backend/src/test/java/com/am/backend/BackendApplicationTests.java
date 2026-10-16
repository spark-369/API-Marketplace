package com.am.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Smoke test that the Spring context wires successfully.
 *
 * <p>Runs against the {@code test} profile, which swaps Redis for a simple in-memory cache and
 * disables JobRunr's background server. The verification is that every bean — services, the security
 * chain, cache manager, rate limiter and gateway — can be constructed with its dependencies
 * satisfied; a missing or ambiguous bean fails this test rather than surfacing at first request in
 * an environment.</p>
 */
@SpringBootTest
@ActiveProfiles("test")
class BackendApplicationTests {

	@Test
	void contextLoads() {
	}

}

