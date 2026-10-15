"""Forward scoped production monitoring events to a verified SES recipient."""
import datetime
import json
import os


from email_templates import render_email

def send_email(subject, body):
    import boto3
    return boto3.client('ses', region_name=os.environ['AWS_REGION']).send_email(
        Source=os.environ['SENDER_EMAIL'],
        Destination={'ToAddresses': [os.environ['ALERT_EMAIL']]},
        Message={'Subject': {'Data': subject[:200], 'Charset': 'UTF-8'},
                 'Body': {'Text': {'Data': body, 'Charset': 'UTF-8'}, 'Html': {'Data': render_email(subject, body, 'Production monitoring'), 'Charset': 'UTF-8'}}})['MessageId']


def lambda_handler(event, context):
    environment = os.environ['ENVIRONMENT_NAME']
    detail = event.get('detail') or {}
    source = event.get('source')
    test = event.get('test_email') is True
    if test:
        title = 'Monitoring setup test'
        reason = 'Deployment/application log streaming and failure alerts are configured. This is a test, not an actual failure.'
    elif source == 'aws.elasticbeanstalk' and detail.get('EnvironmentName') == environment and detail.get('Severity') == 'ERROR':
        title = detail.get('Status', 'Deployment failure')
        reason = detail.get('Message', title)
    elif source == 'aws.cloudwatch' and detail.get('alarmName') in json.loads(os.environ['ALARM_NAMES']) and detail.get('state', {}).get('value') == 'ALARM':
        title = detail['alarmName']
        reason = detail.get('state', {}).get('reason', 'CloudWatch alarm threshold reached.')
    else:
        return {'ignored': True}
    occurred = event.get('time')
    try:
        timestamp = datetime.datetime.fromisoformat(occurred.replace('Z', '+00:00')) if occurred else datetime.datetime.now(datetime.timezone.utc)
    except (ValueError, AttributeError):
        timestamp = datetime.datetime.now(datetime.timezone.utc)
    timestamp = timestamp.astimezone(datetime.timezone(datetime.timedelta(hours=5, minutes=30))).strftime('%Y-%m-%d %H:%M:%S IST')
    subject = f'[{"TEST" if test else "ALERT"}] {environment}: {title}'
    body = '\n'.join([f'Environment: {environment}', f'Time: {timestamp}', f'Event: {title}', '', reason,
                      '', 'CloudWatch logs: https://ap-south-1.console.aws.amazon.com/cloudwatch/home?region=ap-south-1#logsV2:log-groups',
                      'No automatic remediation or deployment is performed by this alert.'])
    message_id = send_email(subject, body)
    print(json.dumps({'environment': environment, 'event_id': event.get('id'), 'test': test, 'email_message_id': message_id}))
    return {'email_message_id': message_id, 'test': test}
