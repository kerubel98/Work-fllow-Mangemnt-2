"""
=============================================================================
IssueTrace by EthioPay: System Detail & Architecture Presentation Builder
=============================================================================
Generates a clean, executive-friendly 20-slide widescreen (16:9) deck using
the IssueTrace Redesigned UI ("EthioPay Brand Palette") design tokens:
  - 40% Pure White (#FFFFFF)
  - 30% Light Neutral Canvas (#F8FAFC / #E2E8F0)
  - 20% EthioPay Navy (#0F142A)
  - 10% EthioPay Orange (#F27421)
  - Typography: Poppins (Headings) + Inter (Body) + JetBrains Mono (Codes)

Adheres to Antigravity Rule 15:
  - All high-resolution screenshots are stored in `presentation_assets/`.
  - Re-executable in a single command: `python build_presentation.py`.
=============================================================================
"""

import os
from PIL import Image
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE


def build_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    base_dir = os.path.dirname(os.path.abspath(__file__))
    assets_dir = os.path.join(base_dir, "presentation_assets")

    # =========================================================================
    # Redesigned UI Design Tokens (EthioPay 40/30/20/10 Brand Palette)
    # =========================================================================
    NAVY = RGBColor(15, 20, 42)             # #0F142A (EthioPay Navy)
    NAVY_SURFACE = RGBColor(21, 28, 54)     # #151C36 (Dark Card Surface)
    NAVY_ELEVATED = RGBColor(30, 39, 74)    # #1E274A (Dark Elevated)
    NAVY_BORDER = RGBColor(40, 51, 88)      # #283358

    CANVAS_LIGHT = RGBColor(248, 250, 252)  # #F8FAFC (Main Light Canvas)
    WHITE = RGBColor(255, 255, 255)         # #FFFFFF (Card Surface)
    BORDER_LIGHT = RGBColor(226, 232, 240)  # #E2E8F0 (Crisp Border)

    ORANGE = RGBColor(242, 116, 33)         # #F27421 (EthioPay Orange Primary CTA)
    ORANGE_SOFT = RGBColor(255, 243, 235)   # Soft Orange Pill Fill

    TEXT_DARK = RGBColor(15, 20, 42)        # #0F142A
    TEXT_BODY = RGBColor(71, 85, 105)       # #475569
    TEXT_MUTED = RGBColor(100, 116, 139)    # #64748B
    TEXT_LIGHT = RGBColor(255, 255, 255)    # #FFFFFF
    TEXT_MUTED_DARK = RGBColor(148, 163, 184)

    SUCCESS = RGBColor(22, 163, 74)         # #16A34A
    SUCCESS_BG = RGBColor(220, 252, 231)    # #DCFCE7
    INFO = RGBColor(2, 132, 199)            # #0284C7
    INFO_BG = RGBColor(224, 242, 254)       # #E0F2FE
    WARNING = RGBColor(217, 119, 6)         # #D97706
    PURPLE = RGBColor(124, 58, 237)         # #7C3AED

    FONT_HEADING = "Poppins"
    FONT_BODY = "Inter"
    FONT_MONO = "JetBrains Mono"

    TOTAL_SLIDES = 20

    def set_bg(slide, color):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = color
        bg.line.fill.background()
        return bg

    def add_footer(slide, slide_num, dark_mode=False):
        # Subtle divider line
        line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.75), Inches(7.05), Inches(11.833), Inches(0.015))
        line.fill.solid()
        line.fill.fore_color.rgb = NAVY_BORDER if dark_mode else BORDER_LIGHT
        line.line.fill.background()

        # Left brand mark
        tb_l = slide.shapes.add_textbox(Inches(0.75), Inches(7.12), Inches(6.0), Inches(0.28))
        tf_l = tb_l.text_frame
        tf_l.margin_top = tf_l.margin_bottom = tf_l.margin_left = tf_l.margin_right = 0
        p_l = tf_l.paragraphs[0]
        r_l = p_l.add_run()
        r_l.text = "IssueTrace by EthioPay  ·  Operational Workflow & Reconciliation Platform"
        r_l.font.name = FONT_BODY
        r_l.font.size = Pt(8.5)
        r_l.font.color.rgb = TEXT_MUTED_DARK if dark_mode else TEXT_MUTED

        # Right slide counter
        tb_r = slide.shapes.add_textbox(Inches(10.5), Inches(7.12), Inches(2.083), Inches(0.28))
        tf_r = tb_r.text_frame
        tf_r.margin_top = tf_r.margin_bottom = tf_r.margin_left = tf_r.margin_right = 0
        p_r = tf_r.paragraphs[0]
        p_r.alignment = PP_ALIGN.RIGHT
        r_r = p_r.add_run()
        r_r.text = f"{slide_num} / {TOTAL_SLIDES}"
        r_r.font.name = FONT_HEADING
        r_r.font.size = Pt(8.5)
        r_r.font.bold = True
        r_r.font.color.rgb = ORANGE if dark_mode else TEXT_DARK

    def add_header(slide, title, category, subtitle=None, slide_num=1, dark_mode=False):
        # Top thin accent bar (EthioPay Orange)
        accent = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.06))
        accent.fill.solid()
        accent.fill.fore_color.rgb = ORANGE
        accent.line.fill.background()

        # Category Pill
        pill_w = Inches(max(2.1, min(3.8, len(category) * 0.11 + 0.6)))
        pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.75), Inches(0.32), pill_w, Inches(0.28))
        pill.fill.solid()
        pill.fill.fore_color.rgb = NAVY_ELEVATED if dark_mode else ORANGE_SOFT
        pill.line.color.rgb = ORANGE
        pill.line.width = Pt(1)
        tf = pill.text_frame
        tf.word_wrap = False
        tf.margin_top = tf.margin_bottom = tf.margin_left = tf.margin_right = 0
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = category.upper()
        run.font.name = FONT_HEADING
        run.font.size = Pt(8.5)
        run.font.bold = True
        run.font.color.rgb = ORANGE

        # Title + Subtitle
        tb = slide.shapes.add_textbox(Inches(0.75), Inches(0.68), Inches(11.8), Inches(0.72))
        tf2 = tb.text_frame
        tf2.word_wrap = True
        tf2.margin_top = tf2.margin_bottom = tf2.margin_left = tf2.margin_right = 0
        p2 = tf2.paragraphs[0]
        r2 = p2.add_run()
        r2.text = title
        r2.font.name = FONT_HEADING
        r2.font.size = Pt(22)
        r2.font.bold = True
        r2.font.color.rgb = TEXT_LIGHT if dark_mode else TEXT_DARK

        if subtitle:
            ps = tf2.add_paragraph()
            ps.space_before = Pt(2)
            rs = ps.add_run()
            rs.text = subtitle
            rs.font.name = FONT_BODY
            rs.font.size = Pt(10.5)
            rs.font.color.rgb = TEXT_MUTED_DARK if dark_mode else TEXT_MUTED

        add_footer(slide, slide_num, dark_mode=dark_mode)

    def add_screenshot_card(slide, img_filename, x, y, max_w, max_h):
        # Clean elevated white card frame
        frame = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, max_w, max_h)
        frame.fill.solid()
        frame.fill.fore_color.rgb = WHITE
        frame.line.color.rgb = BORDER_LIGHT
        frame.line.width = Pt(1.2)

        # Subtle browser header bar
        bar_h = Inches(0.28)
        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x + Inches(0.02), y + Inches(0.02), max_w - Inches(0.04), bar_h)
        bar.fill.solid()
        bar.fill.fore_color.rgb = CANVAS_LIGHT
        bar.line.fill.background()

        dot_colors = [RGBColor(239, 68, 68), RGBColor(245, 158, 11), RGBColor(34, 197, 94)]
        for i, dc in enumerate(dot_colors):
            dot = slide.shapes.add_shape(MSO_SHAPE.OVAL, x + Inches(0.14 + i * 0.16), y + Inches(0.10), Inches(0.09), Inches(0.09))
            dot.fill.solid()
            dot.fill.fore_color.rgb = dc
            dot.line.fill.background()

        img_path = os.path.join(assets_dir, img_filename)
        if os.path.exists(img_path):
            try:
                with Image.open(img_path) as im:
                    iw, ih = im.size
                aspect = iw / float(ih)
                avail_w = max_w - Inches(0.24)
                avail_h = max_h - bar_h - Inches(0.20)
                if avail_w / avail_h > aspect:
                    target_h = avail_h
                    target_w = target_h * aspect
                else:
                    target_w = avail_w
                    target_h = target_w / aspect
                ix = x + (max_w - target_w) / 2
                iy = y + bar_h + (max_h - bar_h - target_h) / 2
                slide.shapes.add_picture(img_path, ix, iy, width=target_w, height=target_h)
            except Exception as e:
                print(f"Warning rendering {img_filename}: {e}")

    def build_feature_slide(slide_num, title, category, subtitle, img_filename, summary, points, highlight_tip):
        slide = prs.slides.add_slide(blank_layout)
        set_bg(slide, CANVAS_LIGHT)
        add_header(slide, title, category, subtitle=subtitle, slide_num=slide_num, dark_mode=False)

        # Left Panel: Clean structured white card with key points
        left_x = Inches(0.75)
        left_y = Inches(1.50)
        left_w = Inches(4.45)
        left_h = Inches(5.32)

        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left_x, left_y, left_w, left_h)
        card.fill.solid()
        card.fill.fore_color.rgb = WHITE
        card.line.color.rgb = BORDER_LIGHT
        card.line.width = Pt(1)

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.22)
        tf.margin_left = Inches(0.24)
        tf.margin_right = Inches(0.22)
        tf.margin_bottom = Inches(0.18)

        p_sum = tf.paragraphs[0]
        r_sum = p_sum.add_run()
        r_sum.text = summary
        r_sum.font.name = FONT_BODY
        r_sum.font.size = Pt(10.5)
        r_sum.font.color.rgb = TEXT_BODY

        for idx, (head, desc) in enumerate(points):
            ph = tf.add_paragraph()
            ph.space_before = Pt(12 if idx == 0 else 10)
            rh_num = ph.add_run()
            rh_num.text = f"0{idx + 1}  "
            rh_num.font.name = FONT_HEADING
            rh_num.font.size = Pt(10.5)
            rh_num.font.bold = True
            rh_num.font.color.rgb = ORANGE

            rh_txt = ph.add_run()
            rh_txt.text = head
            rh_txt.font.name = FONT_HEADING
            rh_txt.font.size = Pt(10.5)
            rh_txt.font.bold = True
            rh_txt.font.color.rgb = TEXT_DARK

            pd = tf.add_paragraph()
            pd.space_before = Pt(2)
            rd = pd.add_run()
            rd.text = desc
            rd.font.name = FONT_BODY
            rd.font.size = Pt(9.5)
            rd.font.color.rgb = TEXT_BODY

        # Bottom Highlight Pill inside Left Card
        tip_y = left_y + left_h - Inches(0.88)
        tip_box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left_x + Inches(0.18), tip_y, left_w - Inches(0.36), Inches(0.70))
        tip_box.fill.solid()
        tip_box.fill.fore_color.rgb = ORANGE_SOFT
        tip_box.line.color.rgb = ORANGE
        tip_box.line.width = Pt(0.75)

        ttf = tip_box.text_frame
        ttf.word_wrap = True
        ttf.margin_top = Inches(0.08)
        ttf.margin_left = Inches(0.14)
        ttf.margin_right = Inches(0.14)
        tp = ttf.paragraphs[0]
        tr1 = tp.add_run()
        tr1.text = "KEY VALUE: "
        tr1.font.name = FONT_HEADING
        tr1.font.size = Pt(8.5)
        tr1.font.bold = True
        tr1.font.color.rgb = ORANGE

        tr2 = tp.add_run()
        tr2.text = highlight_tip
        tr2.font.name = FONT_BODY
        tr2.font.size = Pt(8.8)
        tr2.font.color.rgb = TEXT_DARK

        # Right Panel: Screenshot Showcase
        add_screenshot_card(slide, img_filename, Inches(5.42), Inches(1.50), Inches(7.16), Inches(5.32))

    # =========================================================================
    # SLIDE 1: Hero Title Slide (EthioPay Navy + Orange)
    # =========================================================================
    s1 = prs.slides.add_slide(blank_layout)
    set_bg(s1, NAVY)

    top_accent = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.10))
    top_accent.fill.solid()
    top_accent.fill.fore_color.rgb = ORANGE
    top_accent.line.fill.background()

    # Brand Badge
    badge = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.95), Inches(1.05), Inches(3.6), Inches(0.36))
    badge.fill.solid()
    badge.fill.fore_color.rgb = NAVY_ELEVATED
    badge.line.color.rgb = ORANGE
    badge.line.width = Pt(1)
    btf = badge.text_frame
    bp = btf.paragraphs[0]
    bp.alignment = PP_ALIGN.CENTER
    br = bp.add_run()
    br.text = "ISSUETRACE BY ETHIOPAY  ·  SYSTEM DETAIL"
    br.font.name = FONT_HEADING
    br.font.size = Pt(9.5)
    br.font.bold = True
    br.font.color.rgb = ORANGE

    # Hero Title & Subtitle
    tb1 = s1.shapes.add_textbox(Inches(0.95), Inches(1.65), Inches(11.4), Inches(2.9))
    tf1 = tb1.text_frame
    tf1.word_wrap = True
    p1 = tf1.paragraphs[0]
    r1 = p1.add_run()
    r1.text = "Operational Workflow &\nReconciliation Platform"
    r1.font.name = FONT_HEADING
    r1.font.size = Pt(40)
    r1.font.bold = True
    r1.font.color.rgb = WHITE

    p2 = tf1.add_paragraph()
    p2.space_before = Pt(14)
    r2 = p2.add_run()
    r2.text = (
        "End-to-end architecture, automated ingestion, visual DAG validation, forensic two-level "
        "investigation, and Maker-Checker dual authorization built for high-volume financial operations."
    )
    r2.font.name = FONT_BODY
    r2.font.size = Pt(14)
    r2.font.color.rgb = TEXT_MUTED_DARK

    # 4 Core Pillars at Bottom
    pillars = [
        ("01  Automated Ingestion", "Multi-format files (CSV, XLSX, XML), scheduled SFTP feeds, and 3-tier schema mapping."),
        ("02  Visual DAG Engine", "Drag-and-drop validation pipelines compiled to batched tuple SQL in UNLOGGED mirrors."),
        ("03  2-Level Investigation", "Row-level trajectory forensics paired with deep cross-system core ledger comparison."),
        ("04  Maker-Checker Control", "Strict Four-Eyes dual authorization with immutable snapshots and anti-self-approval.")
    ]
    cw = Inches(2.72)
    cgap = Inches(0.22)
    cx0 = Inches(0.95)
    cy0 = Inches(5.05)

    for i, (ptitle, pdesc) in enumerate(pillars):
        cx = cx0 + i * (cw + cgap)
        c = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, cx, cy0, cw, Inches(1.75))
        c.fill.solid()
        c.fill.fore_color.rgb = NAVY_SURFACE
        c.line.color.rgb = NAVY_BORDER
        c.line.width = Pt(1)

        bar = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, cx, cy0, cw, Inches(0.06))
        bar.fill.solid()
        bar.fill.fore_color.rgb = ORANGE
        bar.line.fill.background()

        ctf = c.text_frame
        ctf.word_wrap = True
        ctf.margin_top = Inches(0.18)
        ctf.margin_left = Inches(0.18)
        ctf.margin_right = Inches(0.16)

        cp1 = ctf.paragraphs[0]
        cr1 = cp1.add_run()
        cr1.text = ptitle
        cr1.font.name = FONT_HEADING
        cr1.font.size = Pt(11.5)
        cr1.font.bold = True
        cr1.font.color.rgb = WHITE

        cp2 = ctf.add_paragraph()
        cp2.space_before = Pt(6)
        cr2 = cp2.add_run()
        cr2.text = pdesc
        cr2.font.name = FONT_BODY
        cr2.font.size = Pt(9.5)
        cr2.font.color.rgb = TEXT_MUTED_DARK

    # =========================================================================
    # SLIDE 2: End-to-End Operational Lifecycle
    # =========================================================================
    build_feature_slide(
        slide_num=2,
        title="End-to-End Operational Lifecycle",
        category="Platform Overview",
        subtitle="Five deterministic stages from raw partner feed intake to permanent audited sign-off",
        img_filename="44_end_to_end_flow.png",
        summary="IssueTrace automates the complete settlement reconciliation journey with zero manual spreadsheet handling.",
        points=[
            ("Multi-Channel Intake", "Ingests SFTP feeds, Excel/CSV/XML batches, and email attachments into staging."),
            ("Schema Normalization", "Maps external headers to the Global Directory and applies cleaning recipes."),
            ("DAG Pipeline Execution", "Runs existence, amount, and duplicate checks inside isolated UNLOGGED mirrors."),
            ("Compare & Resolve", "Routes mismatches to analysts for forensic lookup and structured resolution.")
        ],
        highlight_tip="Full audit traceability links every task, hashtag, rule verdict, and Checker sign-off."
    )

    # =========================================================================
    # SLIDE 3: Redesigned UI System & 4-Layer Architecture
    # =========================================================================
    build_feature_slide(
        slide_num=3,
        title="Redesigned UI & 4-Layer Ergonomics",
        category="Design System",
        subtitle="EthioPay 40/30/20/10 palette with stationary headers and isolated dual-pane scrolling",
        img_filename="00_design_system.png",
        summary="Streamlined from 6 legacy chrome layers down to 4 purposeful UI layers for maximum workspace clarity.",
        points=[
            ("Unified Navy Sidebar", "5 curated groups (Work, Collaborate, Insights, Build, Admin) with live count badges."),
            ("Clean Top App Bar", "Hierarchical breadcrumbs, global Ctrl+K search, environment pill, and notifications."),
            ("Single Primary CTA", "One clear EthioPay Orange action button per screen eliminates visual clutter."),
            ("Full-Viewport Containment", "Flex-bounded panes with <ErrorBoundary> isolation keep headers stationary.")
        ],
        highlight_tip="40% White · 30% Light Neutral · 20% EthioPay Navy · 10% EthioPay Orange."
    )

    # =========================================================================
    # SLIDE 4: System Architecture & Tech Stack (Dark Navy Slide)
    # =========================================================================
    s4 = prs.slides.add_slide(blank_layout)
    set_bg(s4, NAVY)
    add_header(
        s4,
        "System Architecture & Technology Stack",
        "Technical Architecture",
        subtitle="Decoupled 4-tier architecture engineered for high-throughput financial reconciliation",
        slide_num=4,
        dark_mode=True
    )

    arch_tiers = [
        (
            "TIER 1 · PRESENTATION UI",
            "React 19 · Vite 6 · TailwindCSS 4",
            ORANGE,
            [
                "• Visual DAG Flowchart Studio & Inspector",
                "• Client-side XLSX / CSV / XML ingestion",
                "• Real-time SSE listener & ErrorBoundaries",
                "• Zero business state in localStorage"
            ]
        ),
        (
            "TIER 2 · API & EVENT GATEWAY",
            "Node.js · Express 4.21 · TypeScript",
            INFO,
            [
                "• 22+ modular REST route controllers",
                "• JWT auth, RBAC & team isolation guards",
                "• Server-Sent Events (SSE) live stream",
                "• Centralized Admin OAuth 2.0 resolver"
            ]
        ),
        (
            "TIER 3 · PIPELINE & RULE ENGINE",
            "Core Services Layer (Port 5002)",
            SUCCESS,
            [
                "• Dynamic Rule-to-SQL Compiler",
                "• Investigation Orchestrator & Singleton",
                "• DB Liveness Circuit Breaker",
                "• Recipe Replay & 3-Tier Header Matcher"
            ]
        ),
        (
            "TIER 4 · DATA & EXTERNAL LEDGERS",
            "PostgreSQL + Multi-DB Drivers",
            PURPLE,
            [
                "• Primary PostgreSQL (27+ ACID tables)",
                "• UNLOGGED mirror_{db}_{table} staging",
                "• Isolated task_dataset_transactions",
                "• MySQL 8.x, Remote Postgres, MongoDB"
            ]
        )
    ]

    tw = Inches(5.7)
    th = Inches(2.42)
    tx0 = Inches(0.75)
    ty0 = Inches(1.52)

    for idx, (t_name, t_stack, t_col, t_items) in enumerate(arch_tiers):
        col = idx % 2
        row = idx // 2
        tx = tx0 + col * (tw + Inches(0.43))
        ty = ty0 + row * (th + Inches(0.28))

        card = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, tx, ty, tw, th)
        card.fill.solid()
        card.fill.fore_color.rgb = NAVY_SURFACE
        card.line.color.rgb = NAVY_BORDER
        card.line.width = Pt(1)

        bar = s4.shapes.add_shape(MSO_SHAPE.RECTANGLE, tx, ty + Inches(0.18), Inches(0.08), th - Inches(0.36))
        bar.fill.solid()
        bar.fill.fore_color.rgb = t_col
        bar.line.fill.background()

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.18)
        tf.margin_left = Inches(0.26)
        tf.margin_right = Inches(0.20)

        p0 = tf.paragraphs[0]
        r0 = p0.add_run()
        r0.text = t_name
        r0.font.name = FONT_HEADING
        r0.font.size = Pt(12.5)
        r0.font.bold = True
        r0.font.color.rgb = WHITE

        p1 = tf.add_paragraph()
        p1.space_before = Pt(2)
        r1 = p1.add_run()
        r1.text = t_stack
        r1.font.name = FONT_MONO
        r1.font.size = Pt(9.5)
        r1.font.bold = True
        r1.font.color.rgb = t_col

        for item in t_items:
            pi = tf.add_paragraph()
            pi.space_before = Pt(5)
            ri = pi.add_run()
            ri.text = item
            ri.font.name = FONT_BODY
            ri.font.size = Pt(10)
            ri.font.color.rgb = TEXT_MUTED_DARK

    # =========================================================================
    # SLIDE 5: Core Pipeline Engine & Rule-to-SQL Compilation
    # =========================================================================
    s5 = prs.slides.add_slide(blank_layout)
    set_bg(s5, CANVAS_LIGHT)
    add_header(
        s5,
        "Pipeline Engine & Rule-to-SQL Compilation",
        "Core Engine",
        subtitle="Set-based relational execution using UNLOGGED mirrors, coordinate injection, and cryptographic locks",
        slide_num=5,
        dark_mode=False
    )

    engine_cards = [
        (
            "4 Canonical Box Types",
            ORANGE,
            [
                ("INGESTION_SEARCH", "Pulls external records via batched tuple SQL."),
                ("CONDITION_CHECK", "Evaluates comparators, regex & tolerances."),
                ("RECONCILIATION", "Multi-leg matching & duplicate detection."),
                ("REPORT", "Observational audit flags without mutating math.")
            ]
        ),
        (
            "Verdict ≠ Pipeline Action",
            INFO,
            [
                ("Rule Verdict", "PASS, FAIL, ERROR, or PAUSED_DB_OFFLINE."),
                ("Pipeline Action", "CONTINUE, STOP, CLOSE, FLAG, or REPORT."),
                ("Diagnostic Taint", "REPORT records carry _isDiagnosticOnly: true to bypass downstream mutating calculations.")
            ]
        ),
        (
            "UNLOGGED Mirrors & Locks",
            SUCCESS,
            [
                ("mirror_{db}_{table}", "Stages external data into typed UNLOGGED PostgreSQL tables for instant SQL joins."),
                ("64-Bit Advisory Locks", "MD5-derived BigInt locks prevent 32-bit hash collisions across concurrent jobs."),
                ("Task-Scoped Reversion", "Rollbacks lock only task_revert_{taskId}.")
            ]
        ),
        (
            "Tuple SQL & Coordinates",
            PURPLE,
            [
                ("Coordinate Injection", "Every row carries immutable (task_id, row_number) across all stages."),
                ("Bounded Parameters", "Composite tuples WHERE (c1, c2) IN (...) cap strictly below 30,000 params."),
                ("ANSI Quoting", "Preserves 18-digit financial IDs without float distortion.")
            ]
        )
    ]

    for idx, (ctitle, ccol, citems) in enumerate(engine_cards):
        col = idx % 2
        row = idx // 2
        cx = Inches(0.75) + col * Inches(6.13)
        cy = Inches(1.52) + row * Inches(2.70)

        card = s5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, cx, cy, Inches(5.7), Inches(2.45))
        card.fill.solid()
        card.fill.fore_color.rgb = WHITE
        card.line.color.rgb = BORDER_LIGHT
        card.line.width = Pt(1)

        strip = s5.shapes.add_shape(MSO_SHAPE.RECTANGLE, cx, cy, Inches(5.7), Inches(0.07))
        strip.fill.solid()
        strip.fill.fore_color.rgb = ccol
        strip.line.fill.background()

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.18)
        tf.margin_left = Inches(0.22)
        tf.margin_right = Inches(0.20)

        p0 = tf.paragraphs[0]
        r0 = p0.add_run()
        r0.text = ctitle
        r0.font.name = FONT_HEADING
        r0.font.size = Pt(12.5)
        r0.font.bold = True
        r0.font.color.rgb = TEXT_DARK

        for k, v in citems:
            p = tf.add_paragraph()
            p.space_before = Pt(6)
            rk = p.add_run()
            rk.text = f"• {k}: "
            rk.font.name = FONT_HEADING
            rk.font.size = Pt(9.5)
            rk.font.bold = True
            rk.font.color.rgb = ccol

            rv = p.add_run()
            rv.text = v
            rv.font.name = FONT_BODY
            rv.font.size = Pt(9.5)
            rv.font.color.rgb = TEXT_BODY

    # =========================================================================
    # SLIDE 6: Intake Cockpit & Multi-Channel Staging
    # =========================================================================
    build_feature_slide(
        slide_num=6,
        title="Intake Cockpit & Multi-Channel Staging",
        category="Work · Intake",
        subtitle="Unified ingress for partner emails, SFTP clearing feeds, and manual file uploads",
        img_filename="19_intake.png",
        summary="Captures incoming settlement requests and automatically stages attachments for one-click case creation.",
        points=[
            ("Per-File Task Tracking", "Tracks every attached CSV, XLSX, or XML file independently with pre-filled creators."),
            ("Quick Reply & Triage", "Acknowledge partner disputes or archive resolved threads directly from the drawer."),
            ("Automated SFTP Polling", "Scheduled daemons pull morning clearing files using regex path matching."),
            ("Centralized OAuth 2.0", "Teams connect mailboxes securely using Admin-managed enterprise OAuth credentials.")
        ],
        highlight_tip="Convert any incoming partner attachment into an active investigation task in 1 click."
    )

    # =========================================================================
    # SLIDE 7: Data Mapping, Value Dictionaries & Recipes
    # =========================================================================
    build_feature_slide(
        slide_num=7,
        title="Data Mapping & Composite Cleaning Recipes",
        category="Admin · Data Setup",
        subtitle="Zero-hardcoded schema mapping with 3-tier resolution and deterministic backend replay",
        img_filename="14_data_mapping.png",
        summary="Decouples external partner file formats from internal validation rules using composite mapping templates.",
        points=[
            ("Global Standard Directory", "Defines canonical fields (utrnno, reqamt, status) shared across all teams."),
            ("3-Tier Column Matching", "Resolves headers via Alphanumeric normalization, Directory aliases, and explicit overrides."),
            ("Composite Recipes", "Bundles column projections with ordered cleaning steps (Header Row, Trim, Dedupe)."),
            ("Value Dictionaries", "Translates partner codes (e.g. '00' -> 'APPROVED') before pipeline execution.")
        ],
        highlight_tip="Backend recipeExecutionService replays identical cleaning steps on scheduled cron runs."
    )

    # =========================================================================
    # SLIDE 8: Cases Workspace & Discrepancy Queue
    # =========================================================================
    build_feature_slide(
        slide_num=8,
        title="Cases Workspace & Discrepancy Queue",
        category="Work · Cases",
        subtitle="High-density operational workbench with KPI cards, filter pills, and paginated datasets",
        img_filename="01_cases_workspace.png",
        summary="The daily command center where analysts inspect batch validation results and isolate settlement mismatches.",
        points=[
            ("Live KPI Summary", "Displays Total Records, Passed, Flagged Discrepancies, and Pending Reviews."),
            ("3-Tab Workspace", "Switch seamlessly between Transactions, Central Ledger Cross-Check, and Attachments."),
            ("Contextual Toolbar", "Clean table controls with column visibility toggles and duplicate/unique filter pills."),
            ("Team-Public Consolidation", "Shared cases automatically project into the Team Tasks Kanban board.")
        ],
        highlight_tip="Click any flagged transaction row to launch the forensic trajectory drawer."
    )

    # =========================================================================
    # SLIDE 9: Transaction Forensics Drawer
    # =========================================================================
    build_feature_slide(
        slide_num=9,
        title="Granular Transaction Forensics Drawer",
        category="Work · Investigation",
        subtitle="Row-level stage history, verdict breakdown, and immutable evidence inspection",
        img_filename="02_transaction_drawer.png",
        summary="Provides deep visibility into why a specific transaction failed validation without leaving the workspace.",
        points=[
            ("Stage-by-Stage Audit", "Inspect exact pass/fail verdicts and SQL evaluation outputs across every DAG node."),
            ("Source vs. Mirror Diff", "Compare uploaded file values side-by-side against mirrored core banking columns."),
            ("Diagnostic Taint Badges", "Clearly flags observational REPORT findings that did not halt pipeline math."),
            ("Direct Resolution Trigger", "Stage a Maker proposal or revert a stage directly from the drawer footer.")
        ],
        highlight_tip="Full JSONB validation payloads are safely formatted for instant analyst readability."
    )

    # =========================================================================
    # SLIDE 10: Two-Level Compare & Resolve Workbench
    # =========================================================================
    build_feature_slide(
        slide_num=10,
        title="Compare & Resolve Workbench",
        category="Work · Resolution",
        subtitle="Two-level forensic diffing against live core banking ledgers with Maker-Checker staging",
        img_filename="23_compare_and_resolve.png",
        summary="Equips technicians to reconcile stubborn discrepancies by comparing uploaded records against live DB queries.",
        points=[
            ("Side-by-Side Diffing", "Highlights exact field mismatches (amount, status, timestamp) between systems."),
            ("Resolution Actions", "Propose FORCE_MATCH, WRITE_OFF, or MANUAL_REVERSAL with mandatory audit notes."),
            ("Immutable Evidence Lock", "Freezes _inputData and _mirrorData snapshots in PENDING_CHECKER_REVIEW."),
            ("Safe Stage Reversion", "Roll back erroneous batch runs using task-scoped 64-bit advisory locks.")
        ],
        highlight_tip="Every manual override requires independent Checker approval before final commit."
    )

    # =========================================================================
    # SLIDE 11: Workflow Studio & Visual DAG Canvas
    # =========================================================================
    build_feature_slide(
        slide_num=11,
        title="Workflow Studio & Visual DAG Canvas",
        category="Build · Workflows",
        subtitle="Drag-and-drop pipeline designer with explicit database scoping and topological validation",
        img_filename="03_workflow_studio.png",
        summary="Allows operations leads to design multi-stage validation pipelines visually without writing boilerplate code.",
        points=[
            ("Visual Node Palette", "Connect Search Blocks, Condition Checks, Reconciliation nodes, and Report outputs."),
            ("4-Tier Synchronization", "Syncs Canvas State, Inspector Config, Execution Model, and PostgreSQL Hydration."),
            ("Explicit DB Scoping", "Binds each stage to registered database connections and column configurations."),
            ("Multi-Row Cardinality", "Configures STRICT_SINGLE, EXPLICIT_LATEST, or aggregation strategies per stage.")
        ],
        highlight_tip="Kahn's topological sort verifies DAG acyclicity before compiling the execution plan."
    )

    # =========================================================================
    # SLIDE 12: Modular Rules Library & Multi-Leg Checks
    # =========================================================================
    build_feature_slide(
        slide_num=12,
        title="Modular Rules Library & Duplicate Elimination",
        category="Build · Rules",
        subtitle="Reusable validation blocks compiled into high-speed batched tuple SQL",
        img_filename="04_rules_library.png",
        summary="Standardizes compliance and matching checks into modular blocks shareable across teams.",
        points=[
            ("4 Canonical Check Types", "Supports Existence Checks, Field Comparators, Dual-Source Comparisons, and Status Matches."),
            ("Multi-Leg Duplicate Rules", "Detects duplicate postings across clearing legs with full identifier attribution."),
            ("Pre-Flight Sandbox Test", "Test any validation box against sample transactions before publishing."),
            ("Workflow Bundles", "Package workflows, boxes, and DB configs into versioned, immutable snapshots.")
        ],
        highlight_tip="All validation rules execute via parameterized SQL rather than slow row-by-row loops."
    )

    # =========================================================================
    # SLIDE 13: Universal Hashtag Engine & Automations
    # =========================================================================
    build_feature_slide(
        slide_num=13,
        title="Universal Hashtag Engine & Automations",
        category="Work · Automations",
        subtitle="Executable #hashtags driving zero-file scanners, SFTP ingestion, and compliance sweeps",
        img_filename="06_automations.png",
        summary="Transforms simple #hashtags into first-class automation directives linking data, workflows, and chat.",
        points=[
            ("Type A · Batch Ingestion", "Automatically triggers cleaning recipes and validation on tagged file uploads."),
            ("Type B · Zero-File Scanner", "Executes scheduled SQL scans directly against external databases on cron schedules."),
            ("Type C · ETL Staging", "Streams 500-row chunks from SFTP/IMAP feeds into PostgreSQL pipelines."),
            ("Type D · Compliance Sweep", "Runs non-mutating audits and auto-stages Maker proposals upon passing criteria.")
        ],
        highlight_tip="Link cases, workflows, and chat threads under a single #tag for instant end-to-end search."
    )

    # =========================================================================
    # SLIDE 14: Team Workspace, Kanban & Shared Mailbox
    # =========================================================================
    build_feature_slide(
        slide_num=14,
        title="Team Workspace, Kanban & Shared Mailbox",
        category="Collaborate · Team",
        subtitle="Squad-level task consolidation, shared dispute inboxes, and contextual case chat",
        img_filename="08_team_tasks.png",
        summary="Unifies squad operations into a dedicated workspace with real-time task synchronization and shared inboxes.",
        points=[
            ("Team-Public Kanban", "Operational issues automatically project into To Do, In Progress, and Done columns."),
            ("Shared Team Mailbox", "Manage partner dispute emails together with dual-pane independent scrolling."),
            ("In-Case Slash Directives", "Use @user, @@team, /escalate, and /create-hashtag directly inside case chat."),
            ("Chat-to-Proposal", "Stage technician SQL fixes discussed in chat directly as Maker proposals.")
        ],
        highlight_tip="1-click navigation links jump analysts straight from Kanban cards into the Cases workspace."
    )

    # =========================================================================
    # SLIDE 15: Inter-Team Escalations & Bilateral Agreements
    # =========================================================================
    build_feature_slide(
        slide_num=15,
        title="Inter-Team Escalations & Bilateral Agreements",
        category="Collaborate · Escalations",
        subtitle="Authorized escalation matrix routing with shared rooms and mutual SLA sign-offs",
        img_filename="32_escalation_agreement.png",
        summary="Eliminates cross-department email ping-pong with structured escalation rooms and binding agreements.",
        points=[
            ("Escalation Matrix", "Routes cases only to authorized ESCALATION_TARGET or PARENT_UNIT teams."),
            ("Live Escalation Rooms", "Both escalating and receiving squads inspect the same transaction evidence live."),
            ("Bilateral Agreements", "Receiving leads formally accept, sign, or decline remediation commitments."),
            ("Full Audit Trail", "Records timestamps, SLA metrics, and cross-team ownership transitions.")
        ],
        highlight_tip="Prevents duplicate escalations and guarantees clear ownership across bank departments."
    )

    # =========================================================================
    # SLIDE 16: Maker-Checker Governance & Authority Center
    # =========================================================================
    build_feature_slide(
        slide_num=16,
        title="Maker-Checker Dual Authorization",
        category="Governance · Approvals",
        subtitle="Strict Four-Eyes Principle enforced across resolutions, bundles, and DB promotions",
        img_filename="18_approvals.png",
        summary="Protects financial integrity by requiring independent Checker sign-off on all sensitive state changes.",
        points=[
            ("Anti-Self-Approval", "Hard API & service-layer enforcement: makerId !== checkerId (HTTP 403)."),
            ("Unified Authority Inbox", "Review pending transaction overrides, workflow bundles, and DB promotions in one view."),
            ("Immutable Evidence Diff", "Checkers inspect frozen before/after snapshots before approving or rejecting."),
            ("DLP & Dry-Run Safety", "Mandatory dry-run verification prevents accidental bulk deletions or mutations.")
        ],
        highlight_tip="Operators can never approve their own financial overrides or production rule promotions."
    )

    # =========================================================================
    # SLIDE 17: Multi-Tenant Security, RBAC & Connection Isolation
    # =========================================================================
    build_feature_slide(
        slide_num=17,
        title="Enterprise RBAC & Team Connection Isolation",
        category="Admin · Security",
        subtitle="Team-scoped databases, member privilege ceilings, and centralized OAuth 2.0 secrets",
        img_filename="12_people_access.png",
        summary="Enforces strict multi-tenant boundaries across squads, external databases, and enterprise credentials.",
        points=[
            ("Single Permanent Team", "Each user belongs to one permanent squad for clear jurisdictional accountability."),
            ("Privilege Ceilings", "Managers allocate member DB & query rights strictly within Admin-granted ceilings."),
            ("Team-Scoped DBs", "Connections created inside a team stay private until formally promoted by Admin."),
            ("Centralized OAuth 2.0", "Client Secrets are masked (••••••••) and managed solely at Workspace Admin level.")
        ],
        highlight_tip="Multi-layer authorization chains verify User -> Team -> DB Connection -> Query Type."
    )

    # =========================================================================
    # SLIDE 18: Managerial Dashboard & Executive SLA Analytics
    # =========================================================================
    build_feature_slide(
        slide_num=18,
        title="Managerial Dashboard & SLA Analytics",
        category="Insights · Analytics",
        subtitle="Real-time operational KPIs, MTTD/MTTR tracking, and regulatory compliance exports",
        img_filename="11_dashboard.png",
        summary="Gives department heads live visibility into settlement health, team velocity, and aging SLA risks.",
        points=[
            ("MTTD & MTTR Metrics", "Tracks genuine lifecycle detection and resolution times across teams and hashtags."),
            ("Throughput Trends", "Visualizes incoming transaction volumes against completed squad resolutions."),
            ("Proactive SLA Alerts", "Highlights aging cases nearing breach so leads can rebalance workloads."),
            ("1-Click Audit Exports", "Generates consolidated CSV/Excel reports for internal audit and regulators.")
        ],
        highlight_tip="Live KPIs hydrate directly from PostgreSQL issue and execution tables."
    )

    # =========================================================================
    # SLIDE 19: Real-Time Event Bus & Notification Center
    # =========================================================================
    build_feature_slide(
        slide_num=19,
        title="Real-Time Event Bus & Notification Matrix",
        category="System · Alerts",
        subtitle="Sub-second Server-Sent Events (SSE) with user-configurable notification preferences",
        img_filename="46_notification_center.png",
        summary="Keeps every stakeholder synchronized instantaneously without manual page refreshes.",
        points=[
            ("Live SSE Broadcasts", "Streams pipeline progress, new tasks, chat messages, and approval decisions."),
            ("Unified Notification Center", "Filter alerts by unread, task assignments, mentions, and system events."),
            ("Granular Preferences", "Operators configure alert channels and quiet rules per event category."),
            ("Deep-Link Navigation", "Clicking any alert jumps directly to the exact case, team tab, or approval item.")
        ],
        highlight_tip="Eliminates polling overhead while delivering instant feedback on 50,000-row batch runs."
    )

    # =========================================================================
    # SLIDE 20: Operational Summary & Key Guarantees (EthioPay Navy Slide)
    # =========================================================================
    s20 = prs.slides.add_slide(blank_layout)
    set_bg(s20, NAVY)
    add_header(
        s20,
        "Daily Operational Flow & Architectural Guarantees",
        "Executive Summary",
        subtitle="Six core steps powering accurate, auditable, and resilient back-office settlement",
        slide_num=20,
        dark_mode=True
    )

    sop_cards = [
        ("01 · Intake & Stage", "Pull partner feeds via SFTP, OAuth email, or batch upload into PostgreSQL staging."),
        ("02 · Map & Clean", "Apply composite mapping templates and value dictionaries with 3-tier matching."),
        ("03 · Compile & Mirror", "Run visual DAG workflows via batched tuple SQL in UNLOGGED mirror tables."),
        ("04 · Investigate", "Inspect row-level trajectories and diff mismatches against live core ledgers."),
        ("05 · Collaborate", "Resolve across squads via @mentions, slash directives, and escalation rooms."),
        ("06 · Dual Sign-Off", "Commit final overrides only after independent Four-Eyes Checker approval.")
    ]

    sw = Inches(3.72)
    sh = Inches(2.25)
    sx0 = Inches(0.75)
    sy0 = Inches(1.58)

    for i, (stitle, sdesc) in enumerate(sop_cards):
        col = i % 3
        row = i // 3
        sx = sx0 + col * (sw + Inches(0.33))
        sy = sy0 + row * (sh + Inches(0.35))

        card = s20.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, sx, sy, sw, sh)
        card.fill.solid()
        card.fill.fore_color.rgb = NAVY_SURFACE
        card.line.color.rgb = NAVY_BORDER
        card.line.width = Pt(1)

        top_s = s20.shapes.add_shape(MSO_SHAPE.RECTANGLE, sx, sy, sw, Inches(0.06))
        top_s.fill.solid()
        top_s.fill.fore_color.rgb = ORANGE
        top_s.line.fill.background()

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.24)
        tf.margin_left = Inches(0.22)
        tf.margin_right = Inches(0.20)

        p1 = tf.paragraphs[0]
        r1 = p1.add_run()
        r1.text = stitle
        r1.font.name = FONT_HEADING
        r1.font.size = Pt(13)
        r1.font.bold = True
        r1.font.color.rgb = ORANGE

        p2 = tf.add_paragraph()
        p2.space_before = Pt(10)
        r2 = p2.add_run()
        r2.text = sdesc
        r2.font.name = FONT_BODY
        r2.font.size = Pt(10.5)
        r2.font.color.rgb = TEXT_MUTED_DARK

    # Save presentations to repository root
    out_files = [
        os.path.join(base_dir, "IssueTrace_Redesigned_System_Presentation.pptx"),
        os.path.join(base_dir, "IssueTrace_System_Detail_and_Architecture.pptx"),
        os.path.join(base_dir, "IssueTrace_System_Introduction.pptx"),
        os.path.join(base_dir, "IssueTrace_User_Guide_and_System_Walkthrough.pptx"),
    ]

    print("Presentation generation results:")
    for out_path in out_files:
        try:
            prs.save(out_path)
            print(f"  [SAVED] {out_path}")
        except PermissionError:
            print(f"  [SKIPPED - FILE OPEN] {out_path}")
    print(f"Total slides: {len(prs.slides)}")


if __name__ == "__main__":
    build_deck()
