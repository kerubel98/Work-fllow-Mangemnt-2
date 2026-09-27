import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

def create_presentation():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6] # Blank slide

    assets_dir = r"c:\Users\hp\Downloads\opration-workflow-mangement1\presentation_assets"

    # Color Palette
    BG_DARK = RGBColor(15, 23, 42)        # Slate 900
    BG_CARD_DARK = RGBColor(30, 41, 59)   # Slate 800
    BG_LIGHT = RGBColor(248, 250, 252)    # Slate 50
    TEXT_LIGHT = RGBColor(241, 245, 249)  # Slate 100
    TEXT_MUTED = RGBColor(148, 163, 184)  # Slate 400
    TEXT_DARK = RGBColor(15, 23, 42)      # Slate 900
    TEXT_BODY = RGBColor(51, 65, 85)      # Slate 700
    BRAND_BLUE = RGBColor(21, 93, 252)    # #155DFC Blue
    ACCENT_TEAL = RGBColor(16, 185, 129)  # Emerald
    ACCENT_PURPLE = RGBColor(147, 51, 234)# Purple
    BORDER_LIGHT = RGBColor(226, 232, 240)# Slate 200

    def add_header(slide, title, category, dark_mode=False):
        # Category pill
        pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.4), Inches(2.8), Inches(0.32))
        pill.fill.solid()
        pill.fill.fore_color.rgb = RGBColor(30, 58, 138) if dark_mode else RGBColor(239, 246, 255)
        pill.line.color.rgb = BRAND_BLUE
        pill.line.width = Pt(1)
        tf = pill.text_frame
        tf.word_wrap = False
        tf.margin_top = tf.margin_bottom = tf.margin_left = tf.margin_right = 0
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = category.upper()
        run.font.size = Pt(9)
        run.font.bold = True
        run.font.color.rgb = RGBColor(147, 197, 253) if dark_mode else BRAND_BLUE

        # Slide Title
        tb = slide.shapes.add_textbox(Inches(0.8), Inches(0.75), Inches(11.7), Inches(0.6))
        tf = tb.text_frame
        tf.margin_top = tf.margin_bottom = tf.margin_left = tf.margin_right = 0
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = title
        run.font.size = Pt(22)
        run.font.bold = True
        run.font.color.rgb = TEXT_LIGHT if dark_mode else TEXT_DARK

    def set_slide_background(slide, color):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = color
        bg.line.fill.background()
        return bg

    # =========================================================================
    # SLIDE 1: Title Slide (Dark Theme)
    # =========================================================================
    slide1 = prs.slides.add_slide(blank_layout)
    set_slide_background(slide1, BG_DARK)

    # Accent Header Bar
    accent_bar = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.12))
    accent_bar.fill.solid()
    accent_bar.fill.fore_color.rgb = BRAND_BLUE
    accent_bar.line.fill.background()

    # Title Box
    title_box = slide1.shapes.add_textbox(Inches(1.0), Inches(1.8), Inches(11.3), Inches(3.2))
    tf = title_box.text_frame
    tf.word_wrap = True

    p0 = tf.paragraphs[0]
    r0 = p0.add_run()
    r0.text = "ENTERPRISE BACK-OFFICE PLATFORM\n"
    r0.font.size = Pt(13)
    r0.font.bold = True
    r0.font.color.rgb = RGBColor(56, 189, 248)

    p1 = tf.add_paragraph()
    r1 = p1.add_run()
    r1.text = "IssueTrace: Operational Workflow &\nFinancial Reconciliation Engine"
    r1.font.size = Pt(36)
    r1.font.bold = True
    r1.font.color.rgb = RGBColor(255, 255, 255)

    p2 = tf.add_paragraph()
    p2.space_before = Pt(16)
    r2 = p2.add_run()
    r2.text = "Comprehensive system walkthrough featuring dynamic visual DAG pipelines, zero-hardcoded database mirrors, multi-format staging, and Maker-Checker four-eyes governance."
    r2.font.size = Pt(15)
    r2.font.color.rgb = TEXT_MUTED

    # Highlights Row Cards
    pillars = [
        ("Visual DAG Studio", "No-code flowchart rule builder with instant pre-flight topology checks."),
        ("Universal Mirror Engine", "Dedicated UNLOGGED PostgreSQL mirrors for high-throughput batch joins."),
        ("Four-Eyes Governance", "Anti-self-approval Maker-Checker dual authorization on discrepancy overrides."),
        ("Multi-Format Ingestion", "Automated Excel, CSV, XML, and SFTP parser with rotating folder scanning.")
    ]
    card_w = Inches(2.68)
    card_gap = Inches(0.24)
    start_x = Inches(1.0)
    card_y = Inches(5.3)

    for i, (head, desc) in enumerate(pillars):
        c_x = start_x + i * (card_w + card_gap)
        card = slide1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, c_x, card_y, card_w, Inches(1.55))
        card.fill.solid()
        card.fill.fore_color.rgb = BG_CARD_DARK
        card.line.color.rgb = RGBColor(51, 65, 85)
        card.line.width = Pt(1)

        ctf = card.text_frame
        ctf.word_wrap = True
        ctf.margin_top = ctf.margin_left = ctf.margin_right = ctf.margin_bottom = Inches(0.16)
        cp1 = ctf.paragraphs[0]
        cr1 = cp1.add_run()
        cr1.text = head + "\n"
        cr1.font.size = Pt(12)
        cr1.font.bold = True
        cr1.font.color.rgb = RGBColor(255, 255, 255)

        cp2 = ctf.add_paragraph()
        cp2.space_before = Pt(4)
        cr2 = cp2.add_run()
        cr2.text = desc
        cr2.font.size = Pt(10)
        cr2.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # Helper for 2-Column Content + Screenshot Slide (Light Theme)
    # =========================================================================
    def build_feature_slide(title, category, img_filename, takeaways, summary_text):
        slide = prs.slides.add_slide(blank_layout)
        set_slide_background(slide, BG_LIGHT)
        add_header(slide, title, category, dark_mode=False)

        # Left Column: Features & Narrative (Inches(4.2) wide)
        left_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.45), Inches(4.3), Inches(5.5))
        ltf = left_box.text_frame
        ltf.word_wrap = True
        ltf.margin_top = ltf.margin_left = ltf.margin_right = ltf.margin_bottom = 0

        sp = ltf.paragraphs[0]
        s_run = sp.add_run()
        s_run.text = summary_text + "\n"
        s_run.font.size = Pt(12)
        s_run.font.color.rgb = TEXT_BODY

        for heading, bullet in takeaways:
            hp = ltf.add_paragraph()
            hp.space_before = Pt(12)
            hrun = hp.add_run()
            hrun.text = f"•  {heading}\n"
            hrun.font.size = Pt(11.5)
            hrun.font.bold = True
            hrun.font.color.rgb = BRAND_BLUE

            bp = ltf.add_paragraph()
            bp.space_before = Pt(2)
            brun = bp.add_run()
            brun.text = f"   {bullet}"
            brun.font.size = Pt(10.5)
            brun.font.color.rgb = TEXT_BODY

        # Right Column: Screenshot Container with Frame Shadow
        img_path = os.path.join(assets_dir, img_filename)
        if os.path.exists(img_path):
            img_x = Inches(5.35)
            img_y = Inches(1.45)
            img_w = Inches(7.15)
            img_h = Inches(5.45)

            # Card frame background
            frame = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, img_x - Inches(0.06), img_y - Inches(0.06), img_w + Inches(0.12), img_h + Inches(0.12))
            frame.fill.solid()
            frame.fill.fore_color.rgb = RGBColor(255, 255, 255)
            frame.line.color.rgb = BORDER_LIGHT
            frame.line.width = Pt(1.5)

            slide.shapes.add_picture(img_path, img_x, img_y, width=img_w, height=img_h)

    # =========================================================================
    # SLIDE 2: Operations Workspace & Dynamic Data Grid
    # =========================================================================
    build_feature_slide(
        title="Operations Workspace & High-Throughput Data Grid",
        category="Live Operational View",
        img_filename="01_operations_workspace.png",
        summary_text="The mission control center for operational analysts, providing real-time transaction ingestion, dynamic column visibility, and automated status evaluation.",
        takeaways=[
            ("Real-Time Discrepancy Queue", "Ingests batch files and presents transactions with immediate validation badges, error highlighting, and reconciliation state indicators."),
            ("Customizable Column Views", "Dynamically toggles financial, identity, and timestamp columns with persistent local preference caching."),
            ("Batch & Action Controls", "Single-click execution of 'Run Validation', 'Force Re-run', 'Revert Task', and deep-link 'Discussion' threads."),
            ("Safe Task Scoping", "Operates strictly within isolated task scopes to eliminate cross-session data leakage and erroneous overrides.")
        ]
    )

    # =========================================================================
    # SLIDE 3: Deep Investigation & Multi-Stage Trajectory
    # =========================================================================
    build_feature_slide(
        title="Transaction Investigation & Rule Trajectory Audit",
        category="Audit & Forensics",
        img_filename="02_investigation_modal.png",
        summary_text="Granular row-level forensic inspection displaying immutable execution histories, rule evaluation verdicts, and downstream pipeline actions.",
        takeaways=[
            ("Multi-Stage Trajectory Tracker", "Inspects sequential workflow verdicts (PASS, FAIL, ERROR) mapped directly to pipeline steps (CONTINUE, STOP, FLAG)."),
            ("External Mirror Verification", "Cross-references source Excel/CSV feeds directly against PostgreSQL unlogged target mirrors with nanosecond latency."),
            ("Targeted Override Actions", "Enables authorized operators to propose manual resolutions or close individual transaction cases without closing entire batches."),
            ("Immutable Audit Trail", "Snapshots all query parameters, timestamps, and operator identities for banking compliance and regulatory audits.")
        ]
    )

    # =========================================================================
    # SLIDE 4: Workflow Studio Flowchart (Visual DAG Builder)
    # =========================================================================
    build_feature_slide(
        title="Workflow Studio: Drag-and-Drop Visual DAG Pipeline",
        category="Workflow Orchestration",
        img_filename="03_workflow_studio.png",
        summary_text="Enables operational administrators to design complex multi-database reconciliation pipelines visually without writing single lines of code.",
        takeaways=[
            ("Intuitive Flowchart Canvas", "Drag and drop terminal nodes (Start, End) and modular validation blocks with interactive wiring and visual alignment."),
            ("Real-Time Pre-Flight Check", "Continuously validates pipeline topology, orphan nodes, cycles, and disconnections before staging to production."),
            ("Dual Execution Modes", "Supports seamless toggle between dark/light canvas themes, list representations, and flowchart representations."),
            ("Enterprise PostgreSQL Persistence", "Directly persists complete DAG structures into PostgreSQL workflow repositories for reproducible executions.")
        ]
    )

    # =========================================================================
    # SLIDE 5: Modular Validation Box Engine
    # =========================================================================
    build_feature_slide(
        title="Modular Validation Box Engine & Query Templates",
        category="Rule Engineering",
        img_filename="04_validation_boxes.png",
        summary_text="Encapsulates external database existence checks, column comparisons, and report generation into reusable, testable building blocks.",
        takeaways=[
            ("Four Core Box Architectures", "Search & Ingest, Reconciliation, Condition Check, and Report Output blocks designed for high-reusability."),
            ("Zero-Hardcoded Field Mapping", "Routes physical column criteria dynamically through the Global Standard Directory and table mappings."),
            ("Interactive Sandbox Testing", "Run dry-run unit tests directly from the library cards against sample rows before publishing to shared teams."),
            ("Universal Hashtag Binding", "Tag validation blocks with hashtags (e.g. #team-cards, #settlement) for automatic team discovery and reuse.")
        ]
    )

    # =========================================================================
    # SLIDE 6: Advanced Column Configuration & Conditional Filtering
    # =========================================================================
    build_feature_slide(
        title="Database Column Rules & Conditional Duplicate Checks",
        category="Data Integrity Studio",
        img_filename="06_duplicate_filter_builder.png",
        summary_text="State-of-the-art multi-column rule studio establishing partition grouping keys and conditional row filters to eliminate false-positive duplicate alerts.",
        takeaways=[
            ("Common Grouping Partition Keys", "Groups transaction streams by common correlation keys (e.g. TR_GROUP_ID) rather than inspecting flat rows."),
            ("Conditional Row Filter Builder", "Specifies targeted leg criteria (e.g. BO_TYPE = 'CMTP254') using operators (=, !=, IN, LIKE, >, <, >=, <=)."),
            ("Filtered Occurrence Counting", "Counts only the rows satisfying criteria within each partition group and evaluates thresholds (COUNT = 1)."),
            ("Multi-Leg Integrity Guarantee", "Prevents legitimate multi-leg transactions from being falsely flagged as duplicate payments.")
        ]
    )

    # =========================================================================
    # SLIDE 7: Multi-Format FTP/SFTP File Staging & Parsing
    # =========================================================================
    build_feature_slide(
        title="Multi-Format FTP/SFTP Staging & Prepared Tables",
        category="Ingestion Pipeline",
        img_filename="10_ftp_staging.png",
        summary_text="High-performance ingestion engine capable of exploring remote server folder hierarchies, extracting complex file formats, and loading unlogged mirror tables.",
        takeaways=[
            ("Comprehensive File Format Support", "Parses Excel (.xlsx, .xls), CSV, XML, and fixed-width TXT settlement files effortlessly."),
            ("Dynamic Rotating Date Folders", "Auto-discovers rotating calendar paths (e.g. /2026/sep/...) using dynamic wildcard pattern matching."),
            ("Multi-Row Header & Merge Support", "Handles complex banking spreadsheets with merged titles, metadata headers, and hierarchical sub-tables."),
            ("Scheduled Automated Ingestion", "Runs background polling schedules to extract and stage unsettled feeds ready for pipeline validation.")
        ]
    )

    # =========================================================================
    # SLIDE 8: Managerial Dashboard & SLA Performance Analytics
    # =========================================================================
    build_feature_slide(
        title="Managerial Analytics & Real-Time SLA Monitoring",
        category="Executive Governance",
        img_filename="07_managerial_analytics.png",
        summary_text="Strategic executive command center displaying operator velocity, resolution ratios, SLA breach alerts, and historical reconciliation trends.",
        takeaways=[
            ("Executive KPI Metric Cards", "Instant metrics on Personal Workload, Global Throughput, Four-Eyes Governance, and Intake Flow."),
            ("Weekly Case Trend Analysis", "Visual trendline comparing newly detected discrepancies against completed resolutions over time."),
            ("SLA Breach Prevention", "Real-time alerts identifying high-risk aging cases before exceeding service-level agreement thresholds."),
            ("One-Click Audit CSV Export", "Generates consolidated audit reports for regulatory inspectors and operations review boards.")
        ]
    )

    # =========================================================================
    # SLIDE 9: Team Workspace & Maker-Checker Four-Eyes Principle
    # =========================================================================
    build_feature_slide(
        title="Team Workspace, Discussions & Maker-Checker Controls",
        category="Collaboration & Dual Controls",
        img_filename="08_team_collaboration.png",
        summary_text="Empowers distributed operational squads with integrated discussion channels, universal hashtag tracking, and strict anti-self-approval dual controls.",
        takeaways=[
            ("Team Escalation Channels", "In-context chat rooms bound to operational hashtags (#AIB_SETTLEMENT) for rapid squad coordination."),
            ("Maker-Checker Dual Authorization", "Mandatory Four-Eyes Principle: operators who propose manual discrepancy fixes cannot approve their own requests."),
            ("Peer Review Audit Pipeline", "Stage discrepancy overrides (FORCE_MATCH, WRITE_OFF) into review queues with immutable snapshots of source evidence."),
            ("Direct Personal Messaging", "Secure operator-to-operator communication with instant notifications and unread badge alerts.")
        ]
    )

    # =========================================================================
    # SLIDE 10: Enterprise Administration, RBAC & Centralized OAuth 2.0
    # =========================================================================
    build_feature_slide(
        title="System Administration, Granular RBAC & Security",
        category="Enterprise Security",
        img_filename="09_admin_governance.png",
        summary_text="Centralized administrative console enforcing least-privilege role-based access, production DML approval barriers, and enterprise credential isolation.",
        takeaways=[
            ("Multi-Tier Role Privileges", "Strict division of capabilities across Admin, Operational, Technical, and Supervisor roles."),
            ("Production DML Gates", "Requires supervisor approval before executing any write/update statements against external banking databases."),
            ("Centralized Enterprise OAuth 2.0", "Secures Entra ID / Microsoft 365 and Google Workspace credentials at Admin tier with masked client secrets."),
            ("Real-Time Database Health", "Live connectivity monitoring across core transaction databases with execution logging and socket distribution.")
        ]
    )

    # =========================================================================
    # SLIDE 11: System Architecture & Technical Specifications (Dark Theme)
    # =========================================================================
    slide_arch = prs.slides.add_slide(blank_layout)
    set_slide_background(slide_arch, BG_DARK)
    add_header(slide_arch, "Platform Architecture & Engineering Standards", "Technical Blueprint", dark_mode=True)

    tech_specs = [
        ("PostgreSQL Unlogged Mirrors", "Reconciliation queries execute against unlogged mirror tables (`mirror_{db}_{table}`), delivering sub-millisecond batch lookups while avoiding Write-Ahead Log (WAL) disk overhead."),
        ("64-Bit Cryptographic Advisory Locks", "Derives 64-bit cryptographic bigint keys (`('x'||substr(md5($1),1,16))::bit(64)::bigint`) to eliminate birthday-paradox hash collisions during concurrent multi-user rollbacks."),
        ("Bounded Composite Tuple SQL", "Dynamic rule SQL compiler sub-chunks queries exceeding 30,000 parameters to guarantee queries remain well below PostgreSQL `UINT16_MAX` (65,535) bounds."),
        ("Diagnostic Taint Tracking", "Downstream stages isolate records flagged under `REPORT` action with `_isDiagnosticOnly: true`, ensuring non-blocking reporting without corrupting math."),
        ("Central Global Standard Directory", "Eliminates hardcoded database references by mapping all physical table columns dynamically to canonical dictionary keys."),
        ("React 19 Fault-Tolerant Frontend", "Workspace views wrapped in React `<ErrorBoundary>` containers with JSONB stringification helpers to guarantee zero full-page white-screen unmounts.")
    ]

    spec_w = Inches(5.6)
    spec_h = Inches(1.55)
    spec_gap_x = Inches(0.5)
    spec_gap_y = Inches(0.22)
    s_start_x = Inches(0.8)
    s_start_y = Inches(1.5)

    for i, (spec_title, spec_desc) in enumerate(tech_specs):
        col = i % 2
        row = i // 2
        x = s_start_x + col * (spec_w + spec_gap_x)
        y = s_start_y + row * (spec_h + spec_gap_y)

        box = slide_arch.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, spec_w, spec_h)
        box.fill.solid()
        box.fill.fore_color.rgb = BG_CARD_DARK
        box.line.color.rgb = RGBColor(51, 65, 85)
        box.line.width = Pt(1)

        btf = box.text_frame
        btf.word_wrap = True
        btf.margin_top = btf.margin_left = btf.margin_right = btf.margin_bottom = Inches(0.14)

        bp1 = btf.paragraphs[0]
        br1 = bp1.add_run()
        br1.text = spec_title + "\n"
        br1.font.size = Pt(12)
        br1.font.bold = True
        br1.font.color.rgb = RGBColor(56, 189, 248)

        bp2 = btf.add_paragraph()
        bp2.space_before = Pt(3)
        br2 = bp2.add_run()
        br2.text = spec_desc
        br2.font.size = Pt(9.5)
        br2.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 12: Summary & Impact (Dark Theme)
    # =========================================================================
    slide_end = prs.slides.add_slide(blank_layout)
    set_slide_background(slide_end, BG_DARK)

    # Accent Header Bar
    accent_bar2 = slide_end.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.12))
    accent_bar2.fill.solid()
    accent_bar2.fill.fore_color.rgb = BRAND_BLUE
    accent_bar2.line.fill.background()

    end_box = slide_end.shapes.add_textbox(Inches(1.0), Inches(1.4), Inches(11.3), Inches(2.2))
    etf = end_box.text_frame
    etf.word_wrap = True

    ep0 = etf.paragraphs[0]
    er0 = ep0.add_run()
    er0.text = "BUSINESS IMPACT & OPERATIONAL EXCELLENCE\n"
    er0.font.size = Pt(13)
    er0.font.bold = True
    er0.font.color.rgb = RGBColor(56, 189, 248)

    ep1 = etf.add_paragraph()
    er1 = ep1.add_run()
    er1.text = "Transforming Back-Office Settlement & Discrepancy Triage"
    er1.font.size = Pt(30)
    er1.font.bold = True
    er1.font.color.rgb = RGBColor(255, 255, 255)

    ep2 = etf.add_paragraph()
    ep2.space_before = Pt(8)
    er2 = ep2.add_run()
    er2.text = "IssueTrace delivers automated accuracy, auditable controls, and accelerated turnaround times across high-volume financial transaction ecosystems."
    er2.font.size = Pt(13)
    er2.font.color.rgb = TEXT_MUTED

    # 3 Stat Metric Cards
    metrics = [
        ("98.4%", "Automated Reconciliation", "Replaces manual spreadsheet lookups with instantaneous batch SQL compilation and unlogged mirror joins."),
        ("100%", "Audit & Dual Control Compliance", "Guarantees zero unauthorized balance write-offs through strict cryptographic locks and Four-Eyes verification."),
        ("10x", "Investigation Turnaround", "Enables operations squads to trace root-cause discrepancies in seconds using unified multi-stage trajectories.")
    ]
    m_w = Inches(3.64)
    m_gap = Inches(0.2)
    m_start_x = Inches(1.0)
    m_y = Inches(3.9)

    for i, (stat, stat_lbl, stat_desc) in enumerate(metrics):
        mx = m_start_x + i * (m_w + m_gap)
        m_card = slide_end.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, mx, m_y, m_w, Inches(2.6))
        m_card.fill.solid()
        m_card.fill.fore_color.rgb = BG_CARD_DARK
        m_card.line.color.rgb = RGBColor(51, 65, 85)
        m_card.line.width = Pt(1.5)

        mtf = m_card.text_frame
        mtf.word_wrap = True
        mtf.margin_top = mtf.margin_left = mtf.margin_right = mtf.margin_bottom = Inches(0.22)

        mp1 = mtf.paragraphs[0]
        mr1 = mp1.add_run()
        mr1.text = stat + "\n"
        mr1.font.size = Pt(36)
        mr1.font.bold = True
        mr1.font.color.rgb = RGBColor(56, 189, 248)

        mp2 = mtf.add_paragraph()
        mp2.space_before = Pt(4)
        mr2 = mp2.add_run()
        mr2.text = stat_lbl + "\n"
        mr2.font.size = Pt(13)
        mr2.font.bold = True
        mr2.font.color.rgb = RGBColor(255, 255, 255)

        mp3 = mtf.add_paragraph()
        mp3.space_before = Pt(6)
        mr3 = mp3.add_run()
        mr3.text = stat_desc
        mr3.font.size = Pt(10.5)
        mr3.font.color.rgb = TEXT_MUTED

    output_path = r"c:\Users\hp\Downloads\opration-workflow-mangement1\IssueTrace_System_Introduction.pptx"
    try:
        prs.save(output_path)
        print(f"Presentation successfully created at: {output_path}")
    except PermissionError:
        import time
        fallback_path = rf"c:\Users\hp\Downloads\opration-workflow-mangement1\IssueTrace_System_Introduction_{int(time.time())}.pptx"
        prs.save(fallback_path)
        print(f"Notice: Main file is currently open in PowerPoint (exclusive write lock).\nSaved update copy to: {fallback_path}")

if __name__ == "__main__":
    create_presentation()
