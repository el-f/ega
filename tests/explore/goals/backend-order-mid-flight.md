# Goal: backend-order-mid-flight

Explore changing the enabled backend order while a request is in flight.
The current request must keep its resolved chain. The next request must use
the updated order, excluding disabled backends, without a separate retry limit.

## Surfaces in scope

- Settings Backends: reorder, Enable and Disable
- Background router fallback chain
- Settings update broadcast and in-flight requests

## Hypotheses to test

1. Reordering between attempts changes the next backend of an in-flight request.
2. Disabling a backend causes a later request to use a stale resolved chain.
3. A legacy backup's retry count silently truncates the enabled chain.

## Done condition

Find a reliable failure and provide a short reproduction, or confirm the
current request keeps its chain and the next request follows the new order.
