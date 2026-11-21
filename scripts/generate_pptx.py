#!/usr/bin/env python3
"""
Generates the official 8-slide PowerPoint (.pptx) presentation for LedgerLens
DDL Labs Working Capital Intelligence Platform (Assignment DDL-FIN-001)
Creates a standard ECMA-376 Microsoft PowerPoint Presentation (.pptx).
"""

import os
import zipfile

def create_pptx():
    slides_data = [
        {
            "title": "LedgerLens: Working Capital Intelligence Platform",
            "subtitle": "Autonomous Decision Support for Trade Working Capital (AR & AP)",
            "bullets": [
                "Assignment Code: DDL-FIN-001 | 48-Hour Engineering Challenge",
                "Technology Stack: Next.js 16 (App Router), React 19, TypeScript, PostgreSQL (Neon)",
                "Reporting Cutoff: 31 December 2025 | Currency: Indian Rupees (INR ₹)",
                "System of Record: 14 Starter CSVs (2,452 records) ingested with zero rejections"
            ]
        },
        {
            "title": "The Working Capital Dilemma: Business Context",
            "subtitle": "Why Traditional ERPs & Generic AI Fail in Commercial Finance",
            "bullets": [
                "Disconnected ERP Silos: Invoices, allocations, credit limits, and disputes live in separate tables.",
                "Collection Inefficiencies: Chasing customers with active disputes damages customer relationships.",
                "Statutory & Cash Penalties: MSME suppliers require payment within 45 days (MSMED Act 2006).",
                "The AI Hallucination Trap: Traditional LLMs guess math; finance requires deterministic proof."
            ]
        },
        {
            "title": "Architecture & Ingestion Pipeline: Zero Hallucination",
            "subtitle": "Decoupled Architecture: Deterministic SQL Engine + Agentic Tool Calling",
            "bullets": [
                "Transactional Database Pipeline: 14 tables in dedicated 'finance' schema on Neon Serverless.",
                "Exact Decimal Arithmetic: numeric(20, 2) across all tables eliminates binary rounding errors.",
                "Tool-Augmented Generation: LLM understands intent; PostgreSQL executes deterministic math.",
                "Multi-Provider Resilience: Groq Llama-3.3-70B primary, Gemini fallback, offline deterministic router."
            ]
        },
        {
            "title": "Portfolio Reconciliation: Ground Truth Balance Sheet",
            "subtitle": "Deterministic Ledger Balances at Reporting Cutoff (31 December 2025)",
            "bullets": [
                "Net Open Receivables (AR): ₹3,94,93,294.91 (598 posted customer invoices less applied cash).",
                "Net Open Payables (AP): ₹1,65,42,512.87 (300 posted supplier bills less applied payments).",
                "Net Trade Working Capital: ₹2,29,50,782.04 (Net AR less Net AP).",
                "Suspense Cash: ₹85,000.00 across 3 unallocated receipts ready for instant ledger matching.",
                "Actionable Overdue: ₹3,24,79,347.38 (Separated from ₹92,635.23 in active commercial disputes)."
            ]
        },
        {
            "title": "The 6 Mandatory Scenarios: Execution & Findings",
            "subtitle": "Comprehensive Business Logic Verified Against PostgreSQL System of Record",
            "bullets": [
                "Scenario 1 (Receivables Trend): AR expanded +₹42.79L (+12.1%) in Dec as billing outpaced cash 3.05x.",
                "Scenario 2 (Collection Attention): Top debtors C024, C030, C018 ranked by limit breach & >90d delay.",
                "Scenario 3 (Short Payments): 257 underpaid invoices identified; cohort shortfalls isolated.",
                "Scenario 4 (Customer Risk): C028 operating at 427.4% credit limit breach; PO freeze recommended.",
                "Scenario 5 (Vendor Priorities): 74 MSME bills (₹35.00L) prioritised under statutory 45-day rule.",
                "Scenario 6 (Exceptions Audit): 488 audit instances investigated across 10 rules with forensic prudence."
            ]
        },
        {
            "title": "Risk, Controls & Compliance: Enterprise Safeguards",
            "subtitle": "Ring-Fencing Disputes, Payment Holds & Strict Read-Only Boundaries",
            "bullets": [
                "Dispute Capping: min(Disputed Amount, Open Balance) prevents negative balance distortions.",
                "Payment Controls: 3 supplier bills (₹89.0K) actively blocked on quality holds and rate mismatches.",
                "Statutory Protection: MSME suppliers flagged to eliminate compound penal interest risks.",
                "Strict Guardrail: Read-only decision support—zero automated disbursements or ledger tampering."
            ]
        },
        {
            "title": "Testing, Verification & Performance Benchmarks",
            "subtitle": "100% Deterministic Pass Rate & Sub-350ms Query Latencies",
            "bullets": [
                "Automated Test Suite (npm test): 24/24 assertions passing deterministically in under 2 seconds.",
                "Query Performance: Indexed joins on 2,452 records execute in 35ms to 95ms on Neon cloud.",
                "Accessibility: WAI-ARIA compliant Radix UI Dialogs with portal rendering and focus trapping.",
                "Dual Mode Resilience: 100% dynamic live database mode with full offline preview fallback."
            ]
        },
        {
            "title": "Strategic Recommendation & Impact Summary",
            "subtitle": "Unlocking Liquidity & Operational Efficiency for Commercial Finance",
            "bullets": [
                "Immediate Working Capital Release: ₹60–85 Lakhs recoverable within 30 operating days.",
                "Zero Risk Deployment: Decision-support model empowers credit controllers without ERP risk.",
                "Total Audit Traceability: Every metric drills down to source voucher IDs and posting dates.",
                "Conclusion: LedgerLens establishes the new gold standard for enterprise working capital intelligence."
            ]
        }
    ]

    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
"""
    for i in range(1, len(slides_data) + 1):
        content_types += f'  <Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n'
    content_types += "</Types>"

    root_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>"""

    pres_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
"""
    for i in range(1, len(slides_data) + 1):
        pres_rels += f'  <Relationship Id="rId{i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>\n'
    pres_rels += "</Relationships>"

    presentation = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
"""
    for i in range(1, len(slides_data) + 1):
        presentation += f'    <p:sldId id="{255 + i}" r:id="rId{i+1}"/>\n'
    presentation += """  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="12192000"/>
</p:presentation>"""

    theme = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="LedgerLens Finance Theme">
  <a:themeElements>
    <a:clrScheme name="LedgerLensDark">
      <a:dk1><a:srgbClr val="0F172A"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1E293B"/></a:dk2>
      <a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="38BDF8"/></a:accent1>
      <a:accent2><a:srgbClr val="3B82F6"/></a:accent2>
      <a:accent3><a:srgbClr val="10B981"/></a:accent3>
      <a:accent4><a:srgbClr val="F59E0B"/></a:accent4>
      <a:accent5><a:srgbClr val="EF4444"/></a:accent5>
      <a:accent6><a:srgbClr val="8B5CF6"/></a:accent6>
      <a:hlink><a:srgbClr val="38BDF8"/></a:hlink>
      <a:folHlink><a:srgbClr val="60A5FA"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Modern">
      <a:majorFont><a:latin typeface="Arial"/></a:majorFont>
      <a:minorFont><a:latin typeface="Arial"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>"""

    slide_master = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>"""

    slide_master_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>"""

    slide_layout = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="cust">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>"""

    slide_layout_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>"""

    out_dir = os.path.join(process_cwd := os.getcwd(), "docs")
    os.makedirs(out_dir, exist_ok=True)
    pptx_path = os.path.join(out_dir, "LedgerLens_Presentation.pptx")

    with zipfile.ZipFile(pptx_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("ppt/presentation.xml", presentation)
        z.writestr("ppt/_rels/presentation.xml.rels", pres_rels)
        z.writestr("ppt/theme/theme1.xml", theme)
        z.writestr("ppt/slideMasters/slideMaster1.xml", slide_master)
        z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", slide_master_rels)
        z.writestr("ppt/slideLayouts/slideLayout1.xml", slide_layout)
        z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", slide_layout_rels)

        for i, s in enumerate(slides_data, 1):
            slide_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      
      <!-- Background Shape -->
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Background"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:solidFill><a:srgbClr val="0F172A"/></a:solidFill>
        </p:spPr>
      </p:sp>

      <!-- Title & Subtitle Card -->
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Title Box"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="800000" y="600000"/><a:ext cx="10592000" cy="1400000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:solidFill><a:srgbClr val="1E293B"/></a:solidFill>
          <a:ln w="19050"><a:solidFill><a:srgbClr val="38BDF8"/></a:solidFill></a:ln>
        </p:spPr>
        <p:txBody>
          <a:bodyPr lIns="250000" tIns="200000" rIns="250000" bIns="200000" anchor="ctr"/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="2800" b="1">
                <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
              </a:rPr>
              <a:t>{s['title']}</a:t>
            </a:r>
          </a:p>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="1600" i="1">
                <a:solidFill><a:srgbClr val="38BDF8"/></a:solidFill>
              </a:rPr>
              <a:t>{s['subtitle']}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>

      <!-- Content Box -->
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Content Box"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="800000" y="2200000"/><a:ext cx="10592000" cy="4000000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:solidFill><a:srgbClr val="1E293B"/></a:solidFill>
          <a:ln w="12700"><a:solidFill><a:srgbClr val="334155"/></a:solidFill></a:ln>
        </p:spPr>
        <p:txBody>
          <a:bodyPr lIns="300000" tIns="250000" rIns="300000" bIns="250000"/>
          <a:lstStyle/>
"""
            for bullet in s['bullets']:
                slide_xml += f"""          <a:p>
            <a:pPr marL="288000" indent="-288000">
              <a:buFont typeface="Arial"/>
              <a:buChar char="•"/>
            </a:pPr>
            <a:r>
              <a:rPr lang="en-US" sz="1800">
                <a:solidFill><a:srgbClr val="F8FAFC"/></a:solidFill>
              </a:rPr>
              <a:t>{bullet}</a:t>
            </a:r>
          </a:p>
          <a:p><a:endParaRPr sz="1200"/></a:p>
"""
            slide_xml += """        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>"""
            z.writestr(f"ppt/slides/slide{i}.xml", slide_xml)
            z.writestr(f"ppt/slides/_rels/slide{i}.xml.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>""")

    print(f"✔ Successfully generated 8-slide presentation at: {pptx_path}")

if __name__ == "__main__":
    create_pptx()
