"""Dependency-free, escaped HTML emails shared by the SES Lambda packages."""
import html
import re
import urllib.parse


def _links(text):
    pieces = []
    offset = 0
    for match in re.finditer(r'https?://[^\s<>]+', text):
        pieces.append(html.escape(text[offset:match.start()]))
        url = match.group(0)
        escaped = html.escape(url, quote=True)
        try:
            parsed = urllib.parse.urlsplit(url)
            safe = bool(parsed.hostname and not parsed.username and not parsed.password)
        except ValueError:
            safe = False
        if safe:
            pieces.append(f'<a href="{escaped}" style="color:#2563eb;text-decoration:underline;word-break:break-all;">{escaped}</a>')
        else:
            pieces.append(escaped)
        offset = match.end()
    pieces.append(html.escape(text[offset:]))
    return ''.join(pieces)


def render_email(subject, body, category='Operations report'):
    subject = str(subject)
    body = str(body)
    lower = subject.lower()
    if '[test]' in lower or 'setup test' in lower:
        status, color, background = 'SETUP TEST', '#1d4ed8', '#eff6ff'
    elif '[alert]' in lower or 'need attention' in lower:
        status, color, background = 'ACTION REQUIRED', '#b91c1c', '#fef2f2'
    elif 'no confirmed failures' in lower:
        status, color, background = 'REVIEW UNVERIFIED LINKS', '#92400e', '#fffbeb'
    else:
        status, color, background = 'CHECK COMPLETE', '#047857', '#ecfdf5'
    content = []
    metadata = []
    results = []
    for line in body.splitlines():
        detail = re.match(r'^(Environment|Time|Event|Checked|Recipient|Portfolio link check): (.*)$', line)
        summary = re.match(r'^Checked (\d+) links: (\d+) passed, (\d+) failed, (\d+) unverified\.$', line)
        if detail:
            label, value = detail.groups()
            metadata.append(f'<tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;"><div style="font-size:10px;font-weight:700;color:#64748b;letter-spacing:.5px;text-transform:uppercase;">{html.escape(label)}</div><div style="font-size:14px;color:#172033;overflow-wrap:anywhere;">{html.escape(value)}</div></td></tr>')
            continue
        if summary:
            total, passed, failed, unverified = summary.groups()
            cells = ''.join(f'<td align="center" style="padding:16px 4px;width:33%;"><div style="font-size:24px;font-weight:700;color:{tone};">{count}</div><div style="font-size:10px;color:#64748b;font-weight:700;">{label}</div></td>' for count, label, tone in [(passed, 'PASSED', '#047857'), (failed, 'FAILED', '#b91c1c'), (unverified, 'UNVERIFIED', '#92400e')])
            content.append(f'<p style="font-size:13px;color:#64748b;">Checked {total} links</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;"><tr>{cells}</tr></table>')
            continue
        if line == 'No automatic remediation or deployment is performed by this alert.':
            continue
        result = re.match(r'^(OK|FAILED|UNVERIFIED): (https?://\S+)\s+—\s*(.*)$', line)
        if result:
            state, url, detail = result.groups()
            state_color = {'OK': '#047857', 'FAILED': '#b91c1c', 'UNVERIFIED': '#92400e'}[state]
            results.append(f'<tr><td style="padding:14px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;width:100px;color:{state_color};font-size:11px;font-weight:700;">{state}</td><td style="padding:14px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;font-size:13px;">{_links(url)}<div style="margin-top:4px;color:#64748b;font-size:12px;white-space:pre-wrap;">{html.escape(detail)}</div></td></tr>')
        elif line.strip():
            content.append(f'<p style="margin:0 0 16px;font-size:14px;line-height:1.8;color:#475569;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;">{_links(line)}</p>')
    if metadata:
        content.insert(0, '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;table-layout:fixed;">' + ''.join(metadata) + '</table>')
    if results:
        content.append('<h2 style="margin:28px 0 12px;font-size:17px;color:#172033;">Link results</h2><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;table-layout:fixed;"><tr><th scope="col" style="width:100px;padding:10px 12px;text-align:left;background:#f8fafc;color:#64748b;font-size:11px;">STATUS</th><th scope="col" style="padding:10px 12px;text-align:left;background:#f8fafc;color:#64748b;font-size:11px;">LINK / RESULT</th></tr>' + ''.join(results) + '</table>')
    return f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(subject)}</title>
<style>@media only screen and (max-width:620px){{.email-outer{{padding:16px 8px!important}}.email-content{{padding:24px 20px!important}}h1{{font-size:23px!important}}}}</style></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#334155;line-height:1.7;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">{html.escape(subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9"><tr><td class="email-outer" align="center" style="padding:36px 16px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-top:4px solid {color};border-radius:12px;table-layout:fixed;">
<tr><td style="padding:24px 28px;border-bottom:1px solid #e8edf5;"><span style="font-size:20px;font-weight:700;color:#172033;">Nexus<span style="color:#2563eb;">Hub</span></span><div style="font-size:11px;color:#64748b;margin-top:4px;">{html.escape(category.upper())}</div></td></tr>
<tr><td class="email-content" style="padding:30px 28px;word-break:break-word;">
<span style="display:inline-block;padding:5px 10px;border-radius:6px;background:{background};color:{color};font-size:10px;font-weight:700;letter-spacing:.6px;">{status}</span>
<h1 style="margin:16px 0 24px;color:#172033;font-size:26px;line-height:1.3;">{html.escape(subject)}</h1>
{''.join(content)}
</td></tr><tr><td style="padding:20px 24px;background:#f8fafc;border-top:1px solid #e8edf5;font-size:11px;color:#64748b;">Sent automatically by Nexus Hub.<br>This report does not perform automatic remediation or deployment.</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<div style="padding:18px 12px;font-size:11px;color:#94a3b8;">Nexus Hub · Operations notifications</div>
</td></tr></table></body></html>'''
