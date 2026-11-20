import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeIndianRupee, ChevronRight, MessageSquareText, ShieldAlert, WalletCards } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { BalanceSparkline } from "@/components/dashboard/balance-sparkline";
import { InvoiceExplorer } from "@/features/receivables/invoice-explorer";
import { exceptions, money, snapshot } from "@/lib/demo-data";
import { BalanceTrend } from "./balance-trend";
import { ReceivablesAgeing } from "./receivables-ageing";

export function Overview() {
  return (
    <div className="overview-board">
      <div className="overview-analysis">
        <section className="overview-section snapshot-section" aria-labelledby="snapshot-title">
          <div className="overview-section-heading">
            <h2 id="snapshot-title">Balance snapshot</h2>
          </div>
          <div className="stat-strip stat-strip-embedded">
            <StatCard label="Open receivables" value={snapshot.receivablesCrore} liveKey="receivables" format="crore" icon={ArrowDownLeft} chart={<BalanceSparkline balance="receivables" />} />
            <StatCard label="Open payables" value={snapshot.payablesCrore} liveKey="payables" format="crore" icon={ArrowUpRight} chart={<BalanceSparkline balance="payables" />} />
            <StatCard label="Net trade balance" value={snapshot.netTradeBalanceCrore} liveKey="netTradeBalance" format="crore" caption="Receivables less payables" icon={WalletCards} chart={<BalanceSparkline balance="net" />} />
            <StatCard label="Unallocated receipts" value={snapshot.unallocatedReceipts} liveKey="unallocatedReceipts" format="rupees" caption={`${snapshot.unallocatedReceiptCount} receipts to reconcile`} icon={BadgeIndianRupee} attention />
          </div>
        </section>
        <BalanceTrend />
        <section className="overview-section review-panel">
          <div className="overview-section-heading">
            <div><h2>Records to review</h2><p>Disputes and payment holds</p></div>
            <Link className="text-link" href="/exceptions">View exceptions <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
          <div className="list-rows">
            {exceptions.slice(0, 3).map((item) => (
              <Link href={`/exceptions?issue=${item.id}`} className="issue-row" key={item.id}>
                <span className="issue-icon"><ShieldAlert size={16} aria-hidden="true" /></span>
                <span className="issue-info"><strong>{item.party}</strong><small>{item.issue} · {item.reference}</small></span>
                <span className="row-amount">{money(item.amount)}<small>Disputed</small></span>
                <ChevronRight className="issue-chevron" size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
        <section className="overview-section overview-assistant" aria-labelledby="overview-assistant-title">
          <div className="assistant-card-title">
            <MessageSquareText size={16} aria-hidden="true" />
            <h2 id="overview-assistant-title">Ask LedgerLens</h2>
          </div>
          <Link className="text-link" href="/assistant?example=collections">
            Who needs collection attention today? <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>
      </div>
      <div className="overview-invoices">
        <ReceivablesAgeing />
        <InvoiceExplorer compact />
      </div>
    </div>
  );
}
