import fitz
import re
import io
from typing import Dict, List, Optional, Tuple


def _extract_page_blocks_with_fonts(page: fitz.Page) -> List[dict]:
    blocks = page.get_text("dict")["blocks"]
    result = []
    for block in blocks:
        if block["type"] == 0:
            block_lines = []
            for line in block["lines"]:
                line_text = ""
                max_font_size = 0
                fonts = set()
                for span in line["spans"]:
                    line_text += span["text"]
                    if span["size"] > max_font_size:
                        max_font_size = span["size"]
                    fonts.add(span["font"])
                block_lines.append({
                    "text": line_text.strip(),
                    "font_size": max_font_size,
                    "fonts": list(fonts),
                    "bbox": line["bbox"]
                })
            result.append({
                "lines": block_lines,
                "bbox": block["bbox"]
            })
    return result


def _detect_two_columns(page: fitz.Page) -> bool:
    page_width = page.rect.width
    midpoint = page_width / 2
    blocks = page.get_text("dict")["blocks"]
    left_has = False
    right_has = False
    for block in blocks:
        if block["type"] != 0:
            continue
        bbox = block["bbox"]
        if bbox[0] < midpoint - 10:
            left_has = True
        if bbox[2] > midpoint + 10:
            right_has = True
        if bbox[0] < midpoint - 10 and bbox[2] > midpoint + 10:
            return False
    return left_has and right_has


def _reorder_two_column_text(page: fitz.Page) -> List[Tuple[str, float, Tuple[float, float, float, float]]]:
    page_width = page.rect.width
    page_height = page.rect.height
    midpoint = page_width / 2

    blocks = _extract_page_blocks_with_fonts(page)

    left_column = []
    right_column = []

    for block in blocks:
        bbox = block["bbox"]
        center_x = (bbox[0] + bbox[2]) / 2
        for line in block["lines"]:
            if not line["text"]:
                continue
            if center_x < midpoint:
                left_column.append((line["text"], line["font_size"], line["bbox"]))
            else:
                right_column.append((line["text"], line["font_size"], line["bbox"]))

    left_column.sort(key=lambda x: x[2][1])
    right_column.sort(key=lambda x: x[2][1])

    return left_column + right_column


def _extract_text_with_font_info(pdf_bytes: bytes) -> List[Tuple[str, float, int]]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    all_lines = []

    for page_idx, page in enumerate(doc):
        page_height = page.rect.height
        if _detect_two_columns(page):
            lines = _reorder_two_column_text(page)
        else:
            lines = []
            blocks = _extract_page_blocks_with_fonts(page)
            for block in blocks:
                for line in block["lines"]:
                    if line["text"]:
                        lines.append((line["text"], line["font_size"], line["bbox"]))
            lines.sort(key=lambda x: x[2][1])

        for text, font_size, bbox in lines:
            normalized_y = bbox[1] / page_height if page_height > 0 else 0
            all_lines.append((text, font_size, page_idx, normalized_y, bbox))

    doc.close()
    return all_lines


def _extract_title(lines: List[Tuple]) -> Tuple[str, List[Tuple]]:
    if not lines:
        return "", lines

    first_page_lines = [l for l in lines if l[2] == 0]
    if not first_page_lines:
        first_page_lines = lines

    font_sizes = [l[1] for l in first_page_lines]
    if not font_sizes:
        return "", lines

    max_font = max(font_sizes)
    threshold = max_font * 0.85

    title_parts = []
    title_found = False
    consumed_indices = set()

    sorted_by_y = sorted(first_page_lines, key=lambda x: x[3])

    for idx, line in enumerate(sorted_by_y):
        text = line[0].strip()
        font_size = line[1]
        if not text:
            continue
        if font_size >= threshold and not title_found:
            if len(text) > 3 and len(text) < 300:
                if not re.match(r'^(摘要|Abstract|关键词|Keywords|第\s*\d+\s*章|Chapter\s+\d+)', text, re.IGNORECASE):
                    title_parts.append(text)
                    consumed_indices.add(idx)
                    for j in range(idx + 1, min(idx + 4, len(sorted_by_y))):
                        next_text = sorted_by_y[j][0].strip()
                        next_font = sorted_by_y[j][1]
                        if next_font >= threshold * 0.9 and next_text and len(next_text) < 200:
                            if not re.match(r'^(摘要|Abstract|关键词|Keywords)', next_text, re.IGNORECASE):
                                title_parts.append(next_text)
                                consumed_indices.add(j)
                            else:
                                break
                        else:
                            break
                    title_found = True
                    break

    remaining = [l for i, l in enumerate(sorted_by_y) if i not in consumed_indices]
    title = " ".join(title_parts).strip()
    title = re.sub(r'\s+', ' ', title)
    return title, remaining


def _extract_authors(lines: List[Tuple]) -> Tuple[List[str], List[Tuple]]:
    if not lines:
        return [], lines

    author_patterns = [
        r'^[A-Z][a-z]+(\s+[A-Z][a-z]+)+(\s*,\s*[A-Z][a-z]+(\s+[A-Z][a-z]+)*)*$',
        r'^[\u4e00-\u9fa5]{2,4}(\s*[,，、]\s*[\u4e00-\u9fa5]{2,4})*$',
        r'^[A-Z][a-z]+\s+[A-Z]\.\s*[A-Z][a-z]+(\s*,\s*[A-Z][a-z]+\s+[A-Z]\.\s*[A-Z][a-z]+)*$',
    ]

    authors = []
    consumed_indices = set()

    for idx in range(min(15, len(lines))):
        text = lines[idx][0].strip()
        if not text:
            continue
        if re.match(r'^(摘要|Abstract|关键词|Keywords|Introduction|引言)', text, re.IGNORECASE):
            break

        has_email = '@' in text
        has_digit = bool(re.search(r'\d', text))
        if has_email or has_digit:
            if len(authors) > 0:
                break
            continue

        found = False
        clean_text = re.sub(r'[\d\*†‡§¶#]+', '', text).strip()
        clean_text = re.sub(r'\s+', ' ', clean_text)

        if clean_text and len(clean_text) < 200:
            if ',' in clean_text or '，' in clean_text or '、' in clean_text:
                parts = re.split(r'[,，、]', clean_text)
                parts = [p.strip() for p in parts if p.strip()]
                valid_parts = []
                for p in parts:
                    if re.match(r'^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$', p) or re.match(r'^[\u4e00-\u9fa5]{2,4}$', p):
                        valid_parts.append(p)
                    elif re.match(r'^[A-Z][a-z]+\s+[A-Z]\.\s*[A-Z][a-z]+$', p):
                        valid_parts.append(p)
                if valid_parts and len(valid_parts) >= 1:
                    authors.extend(valid_parts)
                    consumed_indices.add(idx)
                    found = True
            else:
                for pat in author_patterns:
                    if re.match(pat, clean_text):
                        authors.append(clean_text)
                        consumed_indices.add(idx)
                        found = True
                        break
                if not found and (re.match(r'^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$', clean_text) or re.match(r'^[\u4e00-\u9fa5]{2,4}$', clean_text)):
                    if 2 <= len(clean_text.split()) <= 5 or re.match(r'^[\u4e00-\u9fa5]{2,4}$', clean_text):
                        authors.append(clean_text)
                        consumed_indices.add(idx)
                        found = True

        if authors and idx > 0 and not found:
            next_text = lines[idx][0].strip() if idx < len(lines) else ""
            if next_text and not re.match(r'^(摘要|Abstract|关键词)', next_text, re.IGNORECASE):
                if '@' not in next_text:
                    continue
            break

    remaining = [l for i, l in enumerate(lines) if i not in consumed_indices]
    unique_authors = []
    seen = set()
    for a in authors:
        if a not in seen:
            seen.add(a)
            unique_authors.append(a)
    return unique_authors, remaining


def _extract_abstracts(lines: List[Tuple], all_text: str) -> Tuple[Dict[str, str], List[Tuple]]:
    abstracts = {}

    zh_abstract = ""
    en_abstract = ""

    zh_pattern = re.compile(r'摘\s*要[:：]?\s*(.*?)(?=\s*关\s*键\s*词|Abstract|ABSTRACT)', re.DOTALL)
    en_pattern = re.compile(r'(?:Abstract|ABSTRACT)[:：]?\s*(.*?)(?=\s*(?:Keywords|KEYWORDS|Introduction|INTRODUCTION|1\s+Introduction|I\.\s+Introduction|引\s*言))', re.DOTALL | re.IGNORECASE)

    zh_match = zh_pattern.search(all_text)
    if zh_match:
        zh_abstract = zh_match.group(1).strip()
        zh_abstract = re.sub(r'\s+', ' ', zh_abstract)

    en_match = en_pattern.search(all_text)
    if en_match:
        en_abstract = en_match.group(1).strip()
        en_abstract = re.sub(r'\s+', ' ', en_abstract)

    if not zh_abstract and not en_abstract:
        for idx, line in enumerate(lines):
            text = line[0].strip()
            if re.match(r'^摘\s*要', text) or re.match(r'^Abstract', text, re.IGNORECASE):
                abstract_parts = []
                start_idx = idx
                for j in range(start_idx, min(start_idx + 30, len(lines))):
                    t = lines[j][0].strip()
                    if re.match(r'^(关\s*键\s*词|Keywords|KEYWORDS|Introduction|INTRODUCTION|1\.|I\.)', t, re.IGNORECASE):
                        break
                    if j == start_idx:
                        clean = re.sub(r'^(摘\s*要|Abstract|ABSTRACT)[:：]?\s*', '', t)
                        if clean:
                            abstract_parts.append(clean)
                    else:
                        abstract_parts.append(t)
                raw_abstract = " ".join(abstract_parts).strip()
                raw_abstract = re.sub(r'\s+', ' ', raw_abstract)
                if re.search(r'[\u4e00-\u9fa5]', raw_abstract):
                    zh_abstract = raw_abstract
                else:
                    en_abstract = raw_abstract
                break

    if zh_abstract:
        abstracts["zh"] = zh_abstract
    if en_abstract:
        abstracts["en"] = en_abstract

    if not abstracts:
        return {}, lines

    return abstracts, lines


def _extract_keywords(lines: List[Tuple], all_text: str) -> Dict[str, List[str]]:
    keywords = {}

    zh_kw_pattern = re.compile(r'关\s*键\s*词[:：]?\s*(.*?)(?=\s*(?:Abstract|ABSTRACT|摘\s*要|Introduction|INTRODUCTION|1\s))', re.DOTALL)
    en_kw_pattern = re.compile(r'(?:Keywords|KEYWORDS|Key\s+words)[:：]?\s*(.*?)(?=\s*(?:Introduction|INTRODUCTION|1\s+Introduction|I\.\s+Introduction|引\s*言|Abstract|ABSTRACT))', re.DOTALL | re.IGNORECASE)

    zh_match = zh_kw_pattern.search(all_text)
    if zh_match:
        raw = zh_match.group(1).strip()
        parts = re.split(r'[;；,，、\s]+', raw)
        parts = [p.strip() for p in parts if p.strip() and len(p.strip()) > 1]
        if parts:
            keywords["zh"] = parts

    en_match = en_kw_pattern.search(all_text)
    if en_match:
        raw = en_match.group(1).strip()
        parts = re.split(r'[;；,，、\s]+', raw)
        parts = [p.strip() for p in parts if p.strip() and len(p.strip()) > 1]
        if parts:
            keywords["en"] = parts

    return keywords


def _extract_emails(all_text: str) -> List[str]:
    email_pattern = r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'
    emails = re.findall(email_pattern, all_text)
    unique = list(dict.fromkeys(emails))
    return unique


def _extract_journal_from_headers_footers(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    candidates = []

    for page_idx in range(min(3, len(doc))):
        page = doc[page_idx]
        page_rect = page.rect
        page_height = page_rect.height

        header_height = page_height * 0.12
        footer_y = page_height * 0.88

        blocks = page.get_text("dict")["blocks"]
        for block in blocks:
            if block["type"] != 0:
                continue
            bbox = block["bbox"]
            in_header = bbox[1] < header_height
            in_footer = bbox[1] > footer_y

            if in_header or in_footer:
                for line in block["lines"]:
                    text = ""
                    for span in line["spans"]:
                        text += span["text"]
                    text = text.strip()
                    if not text:
                        continue
                    if len(text) > 5 and len(text) < 200:
                        if not re.match(r'^\d+$', text) and not re.match(r'^Page\s+\d+', text, re.IGNORECASE):
                            if not re.match(r'^(doi|DOI|https?://|www\.)', text, re.IGNORECASE):
                                candidates.append(text)

    doc.close()

    journal_patterns = [
        r'(?:Journal|Transactions|Proceedings|Letters|Reviews|Advances|Archives|Annals|Bulletin)\s+of\s+[A-Za-z\s&]+',
        r'(?:IEEE|ACM|Nature|Science|Springer|Elsevier|Wiley|Taylor\s*&\s*Francis)\s+[A-Za-z\s&]+',
        r'[A-Z][a-z]+\s+[A-Z][a-z]+\s+(?:Journal|Review|Letters|Bulletin|Transactions)',
        r'[\u4e00-\u9fa5]+(?:学报|杂志|期刊|研究|科学|通报|评论)',
    ]

    for candidate in candidates:
        for pat in journal_patterns:
            m = re.search(pat, candidate)
            if m:
                return m.group(0).strip()

    for c in candidates:
        if len(c.split()) >= 2 and len(c) < 100:
            if not any(w.lower() in c.lower() for w in ['vol', 'volume', 'issue', 'number', 'pp', 'page', 'doi', 'http']):
                return c

    return ""


def _count_references(all_text: str) -> int:
    ref_section_patterns = [
        r'(?:References|REFERENCES|Reference|REFERENCE)\s*[:：]?\s*\n(.*)',
        r'(?:参考文献)\s*[:：]?\s*\n(.*)',
        r'(?:Bibliography|BIBLIOGRAPHY)\s*[:：]?\s*\n(.*)',
    ]

    ref_text = ""
    for pat in ref_section_patterns:
        m = re.search(pat, all_text, re.DOTALL | re.IGNORECASE)
        if m:
            ref_text = m.group(1)
            break

    if not ref_text:
        lines = all_text.split('\n')
        found = False
        ref_lines = []
        for line in lines:
            stripped = line.strip()
            if re.match(r'^(References|REFERENCES|参考文献|Bibliography|BIBLIOGRAPHY)\s*[:：]?$', stripped, re.IGNORECASE):
                found = True
                continue
            if found:
                ref_lines.append(stripped)
        ref_text = "\n".join(ref_lines)

    if not ref_text:
        return 0

    ref_entry_patterns = [
        r'^\s*\[\s*\d+\s*\]',
        r'^\s*\d+\s*[\.、)]',
        r'^\s*[A-Z][a-zA-Z]+,\s+[A-Z]',
    ]

    count = 0
    for line in ref_text.split('\n'):
        stripped = line.strip()
        if not stripped:
            continue
        for pat in ref_entry_patterns:
            if re.match(pat, stripped):
                count += 1
                break

    if count == 0:
        entries = re.split(r'\n\s*\n', ref_text.strip())
        entries = [e for e in entries if e.strip() and len(e.strip()) > 20]
        count = len(entries)

    return min(count, 500)


def extract_paper_metadata(pdf_bytes: bytes) -> Dict:
    lines_with_info = _extract_text_with_font_info(pdf_bytes)

    full_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    all_text = ""
    for page in full_doc:
        all_text += page.get_text() + "\n\n"
    full_doc.close()

    title, remaining_after_title = _extract_title(lines_with_info)
    authors, remaining_after_authors = _extract_authors(remaining_after_title)
    abstracts, _ = _extract_abstracts(remaining_after_authors, all_text)
    keywords = _extract_keywords(remaining_after_authors, all_text)
    emails = _extract_emails(all_text)
    journal = _extract_journal_from_headers_footers(pdf_bytes)
    ref_count = _count_references(all_text)

    abstract_zh = abstracts.get("zh", "")
    abstract_en = abstracts.get("en", "")
    keywords_zh = keywords.get("zh", [])
    keywords_en = keywords.get("en", [])

    if not title:
        first_page_match = re.match(r'^(.+?)(?:\n\s*\n|\n)', all_text.strip())
        if first_page_match:
            candidate = first_page_match.group(1).strip()
            if 5 < len(candidate) < 300:
                title = candidate

    if not authors:
        email_domains = set()
        for e in emails:
            if '@' in e:
                domain = e.split('@')[1]
                if domain and not domain.lower() in ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com']:
                    email_domains.add(domain)

    return {
        "title": title,
        "authors": authors,
        "abstract_zh": abstract_zh,
        "abstract_en": abstract_en,
        "keywords_zh": keywords_zh,
        "keywords_en": keywords_en,
        "emails": emails,
        "journal": journal,
        "reference_count": ref_count
    }


def export_bibtex(metadata: Dict) -> str:
    def escape(s: str) -> str:
        if not s:
            return ""
        s = s.replace('\\', '\\\\')
        s = s.replace('{', '\\{')
        s = s.replace('}', '\\}')
        return s

    def make_key(authors: List[str], title: str) -> str:
        first_author = "anon"
        if authors:
            name = authors[0]
            parts = name.split()
            first_author = parts[-1].lower() if parts else name.lower()
            first_author = re.sub(r'[^a-z0-9]', '', first_author)
        title_words = [w for w in re.split(r'\s+', title) if len(w) > 3]
        title_word = title_words[0].lower() if title_words else "paper"
        title_word = re.sub(r'[^a-z0-9]', '', title_word)
        return f"{first_author}{title_word}"

    authors_str = " and ".join([escape(a) for a in metadata.get("authors", [])])
    keywords = metadata.get("keywords_en", []) or metadata.get("keywords_zh", [])
    keywords_str = ", ".join([escape(k) for k in keywords])
    abstract = metadata.get("abstract_en") or metadata.get("abstract_zh", "")

    key = make_key(metadata.get("authors", []), metadata.get("title", ""))

    lines = [f"@article{{{key},"]
    lines.append(f"  title     = {{{escape(metadata.get('title', ''))}}},")
    if authors_str:
        lines.append(f"  author    = {{{authors_str}}},")
    if metadata.get("journal"):
        lines.append(f"  journal   = {{{escape(metadata['journal'])}}},")
    if keywords_str:
        lines.append(f"  keywords  = {{{keywords_str}}},")
    if abstract:
        lines.append(f"  abstract  = {{{escape(abstract)}}},")
    if metadata.get("emails"):
        lines.append(f"  email     = {{{escape(', '.join(metadata['emails']))}}},")
    lines.append("}")

    return "\n".join(lines)


def export_ris(metadata: Dict) -> str:
    lines = []
    lines.append("TY  - JOUR")

    title = metadata.get("title", "")
    if title:
        lines.append(f"TI  - {title}")

    for author in metadata.get("authors", []):
        lines.append(f"AU  - {author}")

    journal = metadata.get("journal", "")
    if journal:
        lines.append(f"JO  - {journal}")
        lines.append(f"JF  - {journal}")

    for kw in metadata.get("keywords_en", []) or metadata.get("keywords_zh", []):
        lines.append(f"KW  - {kw}")

    abstract = metadata.get("abstract_en") or metadata.get("abstract_zh", "")
    if abstract:
        lines.append(f"AB  - {abstract}")

    for email in metadata.get("emails", []):
        lines.append(f"EM  - {email}")

    ref_count = metadata.get("reference_count", 0)
    if ref_count > 0:
        lines.append(f"NV  - {ref_count}")

    lines.append("ER  - ")
    return "\n".join(lines)
