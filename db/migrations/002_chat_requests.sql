BEGIN;

CREATE TABLE public.ledgerlens_chat_requests (
    request_id uuid PRIMARY KEY,
    client_hash text NOT NULL CHECK (length(client_hash) = 64),
    started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    completed_at timestamptz,
    CHECK (expires_at > started_at)
);

CREATE INDEX ledgerlens_chat_requests_started ON public.ledgerlens_chat_requests (started_at);
CREATE INDEX ledgerlens_chat_requests_active ON public.ledgerlens_chat_requests (client_hash, expires_at)
    WHERE completed_at IS NULL;

COMMIT;
