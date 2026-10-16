package com.am.backend;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Entry point for the API Marketplace backend.
 *
 * <p>Caching is enabled explicitly so the {@code @Cacheable} annotations on service read paths are
 * honoured, and scheduling is enabled for the in-process recurring maintenance tasks defined under
 * {@code com.am.backend.job}.</p>
 */
@SpringBootApplication
@EnableCaching
@EnableScheduling
public class BackendApplication {

	private static final Logger log = LoggerFactory.getLogger(BackendApplication.class);

	public static void main(String[] args) {
		log.info("Starting API Marketplace backend");
		SpringApplication.run(BackendApplication.class, args);
	}

}

