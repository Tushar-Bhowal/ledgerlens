import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getDatabasePool } from "@/server/db";

export async function reserveChatRequest(clientIdentity: string) {
  const client = await getDatabasePool().connect();
  const clientHash = createHash("sha256").update(clientIdentity).digest("hex");
  try {
    await client.query("BEGIN");
    // A transaction lock makes check-and-reserve atomic across server processes and deployments.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ledgerlens:chat-limits'))");
    await client.query("DELETE FROM public.ledgerlens_chat_requests WHERE expires_at < clock_timestamp() - interval '1 minute'");
    const result = await client.query<{ recent: number; active: number; globalActive: number }>(`
      SELECT count(*) FILTER (WHERE client_hash = $1 AND started_at > clock_timestamp() - interval '1 minute')::integer AS recent,
        count(*) FILTER (WHERE client_hash = $1 AND completed_at IS NULL AND expires_at > clock_timestamp())::integer AS active,
        count(*) FILTER (WHERE completed_at IS NULL AND expires_at > clock_timestamp())::integer AS "globalActive"
      FROM public.ledgerlens_chat_requests
    `, [clientHash]);
    const counts = result.rows[0];
    if (counts.recent >= 10 || counts.active >= 2 || counts.globalActive >= 20) {
      await client.query("COMMIT");
      return null;
    }
    const id = randomUUID();
    await client.query(`INSERT INTO public.ledgerlens_chat_requests (request_id, client_hash, expires_at)
      VALUES ($1, $2, clock_timestamp() + interval '90 seconds')`, [id, clientHash]);
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function releaseChatRequest(requestId: string) {
  await getDatabasePool().query("UPDATE public.ledgerlens_chat_requests SET completed_at = clock_timestamp() WHERE request_id = $1", [requestId]);
}


export function keepChatRequestAlive(requestId: string) {
  // Renew the lease while a provider is working; expiry still recovers slots after a crashed process.
  const timer = setInterval(() => {
    void getDatabasePool().query(`UPDATE public.ledgerlens_chat_requests
      SET expires_at = clock_timestamp() + interval '90 seconds'
      WHERE request_id = $1 AND completed_at IS NULL`, [requestId])
      .catch(() => console.error("Chat reservation renewal failed."));
  }, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}
