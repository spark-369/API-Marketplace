package com.am.backend.service;

/**
 * An {@link AutoCloseable} whose {@code close()} declares no checked exceptions.
 *
 * <h2>Why this exists</h2>
 * <p>Try-with-resources requires the resource type to be a subtype of {@code AutoCloseable}
 * (JLS 14.20.3), which rules out {@code Runnable}. But {@code AutoCloseable.close()} declares
 * {@code throws Exception}, so using the bare {@code AutoCloseable} type as a resource forces every
 * caller to handle a checked exception that cannot occur for a simple scope-exit callback — even
 * when the value is a lambda, because the compiler infers the lambda's throws clause from the
 * declared target type.</p>
 *
 * <p>Declaring the narrowed signature in a named interface gives the compiler a target with no
 * checked exceptions, so callers need neither {@code try}/{@code catch} nor a widened test
 * signature.</p>
 *
 * <h2>Usage</h2>
 * <pre>{@code
 * try (ScopeCleanup ignored = ScopeCleanup.after(() -> SecurityContextHolder.clearContext())) {
 *     ...
 * }
 * }</pre>
 */
@FunctionalInterface
public interface ScopeCleanup extends AutoCloseable {

    /**
     * Performs the scope-exit action. Declares no checked exceptions, narrowing
     * {@link AutoCloseable#close()}.
     */
    @Override
    void close();

    /**
     * Adapts a {@link Runnable} to this type, so callers can express the action with a lambda or a
     * method reference such as {@code SecurityContextHolder::clearContext}.
     */
    static ScopeCleanup after(Runnable action) {
        return action::run;
    }
}
