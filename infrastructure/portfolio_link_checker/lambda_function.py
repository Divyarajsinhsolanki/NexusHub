"""Read public portfolio links; send one SES email when checks need attention."""
import concurrent.futures
import datetime
import ipaddress
import json
import os
import socket
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = os.environ.get('PORTFOLIO_BASE_URL', 'https://divyarajsinh.com').rstrip('/')


def validate_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Only public HTTP(S) URLs are supported')
    for address in socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM):
        if not ipaddress.ip_address(address[4][0]).is_global:
            raise ValueError('Non-public address rejected')


class PublicRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, json_body=False):
    validate_url(url)
    request = urllib.request.Request(url, headers={'User-Agent': 'PortfolioLinkChecker/1.0', 'Accept': 'application/json' if json_body else '*/*'})
    with urllib.request.build_opener(PublicRedirect()).open(request, timeout=10) as response:
        if json_body:
            data = response.read(2_000_001)
            if len(data) > 2_000_000:
                raise ValueError('Portfolio response exceeded size limit')
            return json.loads(data)
        return response.status


def extract_links(data):
    links = {BASE_URL + '/', BASE_URL + '/up'}
    profile = data.get('profile') or {}
    values = list((profile.get('social_links') or {}).values())
    values += [profile.get(k) for k in ('avatar_url', 'resume_url')]
    for project in data.get('projects', []):
        values += [project.get(k) for k in ('repository_url', 'live_url', 'cover_image_url')]
        values += [feature.get('screenshot_url') for feature in project.get('features', [])]
    for value in values:
        if isinstance(value, str) and value.strip():
            if value.startswith('/') or urllib.parse.urlsplit(value).scheme in ('http', 'https'):
                links.add(urllib.parse.urljoin(BASE_URL + '/', value.strip()))
    if len(links) > 100:
        raise ValueError('More than 100 links: review checker limit')
    return sorted(links)


def check_link(url):
    for attempt in range(2):
        try:
            return {'url': url, 'state': 'ok', 'status': fetch(url)}
        except urllib.error.HTTPError as error:
            status = error.code
            state = 'unverified' if status in (401, 403, 429, 999) else 'failed'
            result = {'url': url, 'state': state, 'status': status}
        except Exception as error:
            result = {'url': url, 'state': 'failed', 'error': str(error)[:250]}
        if attempt == 0:
            time.sleep(1)
    return result


def send_email(subject, body):
    import boto3
    return boto3.client('ses', region_name=os.environ.get('AWS_REGION', 'ap-south-1')).send_email(
        Source=os.environ['SENDER_EMAIL'], Destination={'ToAddresses': [os.environ['ALERT_EMAIL']]},
        Message={'Subject': {'Data': subject, 'Charset': 'UTF-8'}, 'Body': {'Text': {'Data': body, 'Charset': 'UTF-8'}}})['MessageId']


def lambda_handler(event, context):
    event = event or {}
    # Function URL is a read-only dry run; only Scheduler/direct invocation sends alerts.
    dry_run = bool(event.get('dry_run')) or 'requestContext' in event
    timestamp = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30))).strftime('%Y-%m-%d %H:%M:%S IST')
    results = []
    try:
        links = extract_links(fetch(BASE_URL + '/api/portfolio', json_body=True))
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            results = list(executor.map(check_link, links))
    except Exception as error:
        results = [{'url': BASE_URL + '/api/portfolio', 'state': 'failed', 'error': str(error)[:250]}]
    problems = [result for result in results if result['state'] == 'failed']
    unverified = [result for result in results if result['state'] == 'unverified']
    message_id = None
    if event.get('test_email') and not dry_run:
        message_id = send_email('Portfolio link checker: setup test', f'Daily checks are configured for 9:00 AM IST.\nRecipient: {os.environ["ALERT_EMAIL"]}\nThis is a setup test, not a failure alert.\nChecked: {timestamp}')
    elif problems and not dry_run:
        lines = [f'Portfolio link check: {timestamp}', f'Checked {len(results)} links; {len(problems)} need attention.', '', 'UNVERIFIED means access blocked/login/rate limit; it does not prove the link is broken.', '']
        for result in problems:
            lines.append(f'{result["state"].upper()}: {result["url"]} — {result.get("status", result.get("error"))}')
        message_id = send_email('Portfolio links need attention', '\n'.join(lines))
    report = {'checked_at': timestamp, 'checked': len(results), 'problems': problems, 'unverified': unverified, 'email_message_id': message_id, 'dry_run': dry_run}
    print(json.dumps(report))
    if 'requestContext' in event:
        return {'statusCode': 200, 'headers': {'Content-Type': 'application/json'}, 'body': json.dumps(report)}
    return report
