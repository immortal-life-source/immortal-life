from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "immortal-life-strategic-opportunity.pdf"
LOGO = ROOT / "dealroom-logo-carmine.png"
FALLBACK_LOGO = ROOT / "linkedin-app-logo.png"

PAGE_W, PAGE_H = A4
MARGIN = 38

CARMINE = HexColor("#C73572")
DEEP = HexColor("#30232B")
MUTED = HexColor("#78656F")
PALE = HexColor("#FFF6F9")
PALE_ORANGE = HexColor("#FFF4ED")
LINE = HexColor("#ECDDE5")
GOLD = HexColor("#C7953D")
ORANGE = HexColor("#EE9567")
SOFT_CARMINE = HexColor("#FCE8F0")
WHITE = white


def style(name, size, leading, color=DEEP, font="Helvetica", **kwargs):
    return ParagraphStyle(
        name,
        fontName=font,
        fontSize=size,
        leading=leading,
        textColor=color,
        alignment=TA_LEFT,
        spaceAfter=0,
        **kwargs,
    )


TITLE = style("title", 27, 29, font="Helvetica-Bold")
SUBTITLE = style("subtitle", 9.6, 13.7, MUTED)
BODY = style("body", 8.5, 11.8, MUTED)
BODY_DARK = style("body-dark", 8.3, 11.5, DEEP)
SMALL = style("small", 7.2, 9.6, MUTED)
CARD_TITLE = style("card-title", 10.2, 12, font="Helvetica-Bold")
CARD_BODY = style("card-body", 7.2, 9.6, MUTED)


def draw_paragraph(c, text, x, y_top, width, pstyle):
    paragraph = Paragraph(text, pstyle)
    _, height = paragraph.wrap(width, PAGE_H)
    paragraph.drawOn(c, x, y_top - height)
    return height


def rounded_label(c, text, x, y, fill=SOFT_CARMINE, text_color=CARMINE):
    c.setFont("Helvetica-Bold", 7.2)
    width = stringWidth(text, "Helvetica-Bold", 7.2) + 18
    c.setFillColor(fill)
    c.roundRect(x, y, width, 18, 9, fill=1, stroke=0)
    c.setFillColor(text_color)
    c.drawString(x + 9, y + 6, text)
    return width


def draw_brand(c, page_number):
    logo = LOGO if LOGO.exists() else FALLBACK_LOGO
    if logo.exists():
        c.drawImage(
            ImageReader(str(logo)), MARGIN, PAGE_H - 68,
            width=34, height=34, mask="auto", preserveAspectRatio=True,
        )
    c.setFillColor(CARMINE)
    c.setFont("Helvetica-Bold", 12.5)
    c.drawString(MARGIN + 43, PAGE_H - 48, "immortal.life")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6.8)
    c.drawString(MARGIN + 43, PAGE_H - 60, "GLOBAL LONGEVITY INTELLIGENCE")
    label = "COMPANY OVERVIEW  |  SEPTEMBER 2026"
    label_w = stringWidth(label, "Helvetica-Bold", 7.2) + 18
    rounded_label(c, label, PAGE_W - MARGIN - label_w, PAGE_H - 61)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(MARGIN, PAGE_H - 78, PAGE_W - MARGIN, PAGE_H - 78)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6.8)
    c.drawString(MARGIN, 27, "Mareke Solutions s.r.o.  |  Prague, Czechia  |  hello@immortal.life")
    c.drawRightString(PAGE_W - MARGIN, 27, f"immortal.life  |  {page_number}/2")


def metric_card(c, value, label, note, x, y, width, accent):
    height = 66
    c.setFillColor(WHITE)
    c.setStrokeColor(LINE)
    c.roundRect(x, y, width, height, 12, fill=1, stroke=1)
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(x + 12, y + 38, value)
    c.setFillColor(DEEP)
    c.setFont("Helvetica-Bold", 6.7)
    c.drawString(x + 12, y + 23, label.upper())
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6.5)
    c.drawString(x + 12, y + 11, note)


def feature_card(c, title, text, x, y, width, height, accent=CARMINE):
    c.setFillColor(WHITE)
    c.setStrokeColor(LINE)
    c.roundRect(x, y, width, height, 14, fill=1, stroke=1)
    c.setFillColor(accent)
    c.circle(x + 15, y + height - 18, 3.2, fill=1, stroke=0)
    draw_paragraph(c, title, x + 26, y + height - 11, width - 38, CARD_TITLE)
    draw_paragraph(c, text, x + 14, y + height - 35, width - 28, CARD_BODY)


def section_title(c, eyebrow, title, x, y, width):
    c.setFillColor(CARMINE)
    c.setFont("Helvetica-Bold", 7.2)
    c.drawString(x, y, eyebrow.upper())
    return draw_paragraph(c, title, x, y - 8, width, style("section", 15, 17, font="Helvetica-Bold"))


def bullet(c, text, x, y, width, pstyle=BODY_DARK, accent=CARMINE):
    c.setFillColor(accent)
    c.circle(x + 2.5, y - 5, 2.1, fill=1, stroke=0)
    height = draw_paragraph(c, text, x + 12, y, width - 12, pstyle)
    return max(height, 12)


def page_one(c):
    c.setFillColor(WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(PALE)
    c.roundRect(22, PAGE_H - 264, PAGE_W - 44, 170, 22, fill=1, stroke=0)
    c.saveState()
    c.setStrokeColor(Color(0.78, 0.21, 0.45, alpha=0.15))
    c.setLineWidth(1.2)
    c.ellipse(PAGE_W - 220, PAGE_H - 239, PAGE_W - 53, PAGE_H - 95, fill=0, stroke=1)
    c.setStrokeColor(Color(0.93, 0.55, 0.35, alpha=0.16))
    c.ellipse(PAGE_W - 253, PAGE_H - 252, PAGE_W - 112, PAGE_H - 116, fill=0, stroke=1)
    c.restoreState()
    draw_brand(c, 1)

    draw_paragraph(c, "A global intelligence layer<br/>for longevity science.", MARGIN, PAGE_H - 112, 360, TITLE)
    draw_paragraph(
        c,
        "Immortal.life connects research, clinical trials, universities, funding, regulatory information, corrections, and authoritative global resources through one source-linked longevity knowledge system.",
        MARGIN,
        PAGE_H - 181,
        390,
        SUBTITLE,
    )
    c.setFillColor(DEEP)
    c.setFont("Helvetica-Bold", 8.3)
    c.drawString(MARGIN, PAGE_H - 240, "LIVE PLATFORM  |  CATEGORY-DEFINING DOMAIN  |  INSTITUTIONAL PILOT READY")

    metric_gap = 8
    metric_w = (PAGE_W - 2 * MARGIN - 2 * metric_gap) / 3
    first_y = PAGE_H - 355
    second_y = first_y - 75
    metrics = [
        ("180", "Longevity topics", "organised across 9 domains", CARMINE),
        ("5,435", "Research records", "current public eligible set", ORANGE),
        ("531", "Clinical trials", "current public eligible set", GOLD),
        ("1,256", "Universities", "represented across 89 countries", CARMINE),
        ("231", "Official resources", "directory coverage across 195 countries", GOLD),
        ("547", "Funder identities", "linked to 5,777 award entities", ORANGE),
    ]
    for index, (value, label, note, accent) in enumerate(metrics):
        row, col = divmod(index, 3)
        metric_card(
            c, value, label, note,
            MARGIN + col * (metric_w + metric_gap),
            first_y - row * 75,
            metric_w,
            accent,
        )

    c.setFillColor(MUTED)
    c.setFont("Helvetica-Oblique", 6.6)
    c.drawRightString(PAGE_W - MARGIN, second_y - 12, "Public platform snapshot, 28 Sep 2026. Counts change as eligible history is indexed.")

    section_title(c, "Latest product achievements", "From records to decision-ready context", MARGIN, second_y - 40, PAGE_W - 2 * MARGIN)
    card_gap = 10
    card_w = (PAGE_W - 2 * MARGIN - card_gap) / 2
    card_h = 92
    # Leave a full line of breathing room below the section heading. The former
    # position placed the rounded card border through the title at some render
    # scales.
    card_y1 = second_y - 173
    card_y2 = card_y1 - card_h - 10
    feature_card(
        c, "Living Evidence Dossiers",
        "Reader-first pages for all 180 topics, connecting human evidence, trials, universities, safety context, funding, timelines, and clearly stated unknowns.",
        MARGIN, card_y1, card_w, card_h, CARMINE,
    )
    feature_card(
        c, "Funding Radar",
        "5,777 award entities, 547 funder identities, 1,122 linked publications, and permanent source-backed funder profiles without inferred spending or impact claims.",
        MARGIN + card_w + card_gap, card_y1, card_w, card_h, GOLD,
    )
    feature_card(
        c, "Trial Results Gap Monitor",
        "A transparent registry signal tracking 260 completed longevity trials and whether structured results are visible after a defined reporting window.",
        MARGIN, card_y2, card_w, card_h, ORANGE,
    )
    feature_card(
        c, "Evidence Compare",
        "Side-by-side, source-linked comparison of two topic landscapes without ranking treatments or turning record counts into medical conclusions.",
        MARGIN + card_w + card_gap, card_y2, card_w, card_h, CARMINE,
    )

    c.setFillColor(PALE_ORANGE)
    c.roundRect(MARGIN, 45, PAGE_W - 2 * MARGIN, 34, 10, fill=1, stroke=0)
    draw_paragraph(
        c,
        "Every public insight links back to its source. Immortal.life provides research intelligence and discovery infrastructure, not medical advice or expert endorsement.",
        MARGIN + 13, 68, PAGE_W - 2 * MARGIN - 26, style("footnote", 7.2, 9.5, DEEP),
    )


def page_two(c):
    c.setFillColor(WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    draw_brand(c, 2)
    draw_paragraph(c, "A strategic opportunity to own the trust layer<br/>for a fast-forming global category.", MARGIN, PAGE_H - 112, 490, style("page2-title", 23, 25, font="Helvetica-Bold"))
    draw_paragraph(
        c,
        "Longevity intelligence is fragmented across databases, trial registries, institutions, funders, regulators, and jurisdictions. Immortal.life brings those signals together under an intuitive exact-match brand.",
        MARGIN, PAGE_H - 176, 470, SUBTITLE,
    )

    col_gap = 26
    col_w = (PAGE_W - 2 * MARGIN - col_gap) / 2
    left_x = MARGIN
    right_x = MARGIN + col_w + col_gap
    top = PAGE_H - 238

    section_title(c, "01", "Defensible assets", left_x, top, col_w)
    y = top - 37
    for item in [
        "The exact-match Immortal.life domain and a distinctive, credible public brand.",
        "A 180-topic taxonomy connecting research, trials, universities, funding, regulators, and source records.",
        "Automated ingestion, normalization, relevance, deduplication, quality, provenance, and source-rights infrastructure.",
        "Connected public products: dossiers, comparisons, funding intelligence, trial-transparency monitoring, search, feeds, and datasets.",
        "Reusable institutional workflows that convert source changes into auditable intelligence rather than raw-data dumps.",
    ]:
        y -= bullet(c, item, left_x, y, col_w) + 6

    section_title(c, "02", "Commercial path", right_x, top, col_w)
    y2 = top - 37
    for item in [
        "A six-week institutional pilot focused on 5-10 topics, interventions, companies, competitors, or strategic questions.",
        "A baseline landscape followed by weekly meaningful-change briefings, recruiting-trial alerts, university activity, integrity notices, and source-linked exports.",
        "Recurring professional subscriptions, private dashboards, taxonomy licensing, compliant data services, or API access.",
        "Strategic partnership or acquisition by an organisation that can accelerate distribution, trust, and global coverage.",
    ]:
        y2 -= bullet(c, item, right_x, y2, col_w) + 6

    lower_top = min(y, y2) - 20
    section_title(c, "03", "Strategic fit", left_x, lower_top, col_w)
    fit_y = lower_top - 39
    draw_paragraph(
        c,
        "Longevity biotechnology and pharmaceutical companies; scientific-data and clinical-intelligence platforms; professional publishers; research institutes and foundations; preventive-health businesses; family offices; and mission-driven investors seeking a durable longevity information asset.",
        left_x, fit_y, col_w, BODY,
    )

    section_title(c, "04", "Why now", right_x, lower_top, col_w)
    why_y = lower_top - 39
    draw_paragraph(
        c,
        "The platform is live, its core information architecture is built, and the product has moved beyond listings into interpretable evidence, funding, comparison, and transparency tools. A strategic owner or partner can now compound the value through distribution and institutional adoption.",
        right_x, why_y, col_w, BODY,
    )

    stage_y = 173
    c.setFillColor(PALE)
    c.setStrokeColor(LINE)
    c.roundRect(MARGIN, stage_y, PAGE_W - 2 * MARGIN, 104, 16, fill=1, stroke=1)
    c.setFillColor(CARMINE)
    c.setFont("Helvetica-Bold", 7.2)
    c.drawString(MARGIN + 16, stage_y + 82, "CURRENT STAGE")
    c.setFillColor(DEEP)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN + 16, stage_y + 61, "Live, pre-revenue, and ready for a first institutional pilot.")
    draw_paragraph(
        c,
        "Historical coverage is still expanding. Public directory coverage is not represented as live data integration. Source reuse is permission-aware and fail-closed for commercial outputs.",
        MARGIN + 16, stage_y + 45, PAGE_W - 2 * MARGIN - 32, BODY,
    )

    c.setFillColor(DEEP)
    c.roundRect(MARGIN, 54, PAGE_W - 2 * MARGIN, 96, 16, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(MARGIN + 18, 122, "Open to serious strategic conversations")
    c.setFillColor(HexColor("#F0DFE7"))
    c.setFont("Helvetica", 8)
    c.drawString(MARGIN + 18, 102, "INSTITUTIONAL PILOT  |  STRATEGIC PARTNERSHIP  |  LICENSING  |  ACQUISITION")
    c.setFillColor(CARMINE)
    c.roundRect(PAGE_W - MARGIN - 170, 72, 152, 40, 12, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawCentredString(PAGE_W - MARGIN - 94, 96, "START A CONVERSATION")
    c.setFont("Helvetica", 8.5)
    c.drawCentredString(PAGE_W - MARGIN - 94, 82, "hello@immortal.life")


def create_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    c.setTitle("Immortal.life Company Overview")
    c.setAuthor("Immortal.life")
    c.setSubject("Public strategic opportunity and company overview")
    c.setCreator("Immortal.life")
    page_one(c)
    c.showPage()
    page_two(c)
    c.showPage()
    c.save()
    return OUTPUT


if __name__ == "__main__":
    print(create_pdf())
