import "server-only";
import { getDatabasePool } from "@/server/db";

export interface CustomerMatch {
  id: string;
  name: string;
  creditPeriodDays: number | null;
  paymentTerms: string | null;
}

export async function findCustomers(reference: string): Promise<CustomerMatch[]> {
  const ids = [...reference.matchAll(/\bc\d{3}\b/gi)].map((match) => match[0].toUpperCase());
  const normalized = reference.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // Resolve names against master records; never infer an ID from a name's number.
  const result = await getDatabasePool().query<CustomerMatch>(`
    SELECT customer_id AS id, customer_name AS name,
      credit_period_days AS "creditPeriodDays", payment_terms AS "paymentTerms"
    FROM finance.customer_master
    WHERE CASE WHEN cardinality($1::text[]) > 0 THEN customer_id = ANY($1::text[])
      ELSE strpos(' ' || $2::text || ' ', ' ' ||
        trim(regexp_replace(lower(customer_name), '[^a-z0-9]+', ' ', 'g')) || ' ') > 0
        OR strpos(' ' || $2::text || ' ', ' ' || trim(regexp_replace(lower(regexp_replace(customer_name, '( Pvt Ltd| Private Limited| Ltd| Limited)$', '', 'i')), '[^a-z0-9]+', ' ', 'g')) || ' ') > 0 END
    ORDER BY customer_id
  `, [ids, normalized]);
  return result.rows;
}
