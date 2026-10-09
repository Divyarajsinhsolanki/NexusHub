"""Provision isolated AWS monitoring resources using configured AWS CLI credentials."""
import json
import pathlib
import subprocess
import tempfile
import time
import zipfile

REGION = 'ap-south-1'
NAME = 'nexus-portfolio-link-checker'
EMAIL = 'solanki.divyarajsinhp@gmail.com'
HERE = pathlib.Path(__file__).resolve().parent


def aws(*args, allow_missing=False):
    result = subprocess.run(['aws', *args, '--region', REGION, '--output', 'json'], text=True, capture_output=True)
    if result.returncode:
        if allow_missing and any(code in result.stderr for code in ('NoSuchEntity', 'ResourceNotFoundException')):
            return None
        raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout) if result.stdout.strip() else {}


def role(name, service, policy):
    existing = aws('iam', 'get-role', '--role-name', name, allow_missing=True)
    if not existing:
        existing = aws('iam', 'create-role', '--role-name', name, '--assume-role-policy-document', json.dumps({'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Service': service}, 'Action': 'sts:AssumeRole'}]}))
    aws('iam', 'put-role-policy', '--role-name', name, '--policy-name', NAME, '--policy-document', json.dumps(policy))
    return existing['Role']['Arn']


def main():
    account = aws('sts', 'get-caller-identity')['Account']
    function_arn = f'arn:aws:lambda:{REGION}:{account}:function:{NAME}'
    log_arn = f'arn:aws:logs:{REGION}:{account}:log-group:/aws/lambda/{NAME}:*'
    identity = aws('sesv2', 'get-email-identity', '--email-identity', EMAIL)
    email_resources = [f'arn:aws:ses:{REGION}:{account}:identity/{EMAIL}']
    if identity.get('ConfigurationSetName'):
        email_resources.append(f'arn:aws:ses:{REGION}:{account}:configuration-set/{identity["ConfigurationSetName"]}')
    execution = role(NAME + '-execution', 'lambda.amazonaws.com', {'Version': '2012-10-17', 'Statement': [
        {'Effect': 'Allow', 'Action': ['logs:CreateLogStream', 'logs:PutLogEvents'], 'Resource': log_arn},
        {'Effect': 'Allow', 'Action': 'ses:SendEmail', 'Resource': email_resources, 'Condition': {'StringEquals': {'ses:FromAddress': EMAIL}, 'ForAllValues:StringEquals': {'ses:Recipients': [EMAIL]}}}
    ]})
    try:
        aws('logs', 'create-log-group', '--log-group-name', '/aws/lambda/' + NAME)
    except RuntimeError as error:
        if 'ResourceAlreadyExistsException' not in str(error):
            raise
    aws('logs', 'put-retention-policy', '--log-group-name', '/aws/lambda/' + NAME, '--retention-in-days', '7')
    environment = json.dumps({'Variables': {'PORTFOLIO_BASE_URL': 'https://divyarajsinh.com', 'ALERT_EMAIL': EMAIL, 'SENDER_EMAIL': EMAIL}})
    with tempfile.TemporaryDirectory() as directory:
        archive = pathlib.Path(directory) / 'function.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
            bundle.write(HERE / 'lambda_function.py', 'lambda_function.py')
        existing = aws('lambda', 'get-function', '--function-name', NAME, allow_missing=True)
        if existing:
            aws('lambda', 'update-function-code', '--function-name', NAME, '--zip-file', 'fileb://' + str(archive))
            aws('lambda', 'wait', 'function-updated', '--function-name', NAME)
            aws('lambda', 'update-function-configuration', '--function-name', NAME, '--runtime', 'python3.12', '--handler', 'lambda_function.lambda_handler', '--memory-size', '128', '--timeout', '180', '--environment', environment, '--role', execution)
        else:
            for attempt in range(6):
                try:
                    aws('lambda', 'create-function', '--function-name', NAME, '--runtime', 'python3.12', '--handler', 'lambda_function.lambda_handler', '--memory-size', '128', '--timeout', '180', '--architectures', 'arm64', '--environment', environment, '--role', execution, '--zip-file', 'fileb://' + str(archive), '--description', 'Daily public portfolio links; SES alerts at 09:00 Asia/Kolkata')
                    break
                except RuntimeError as error:
                    if 'cannot be assumed' not in str(error) or attempt == 5:
                        raise
                    time.sleep(5)
    aws('lambda', 'wait', 'function-active-v2', '--function-name', NAME)
    aws('lambda', 'wait', 'function-updated-v2', '--function-name', NAME)
    try:
        aws('lambda', 'put-function-concurrency', '--function-name', NAME, '--reserved-concurrent-executions', '1')
    except RuntimeError as error:
        if 'UnreservedConcurrentExecution below its minimum' not in str(error):
            raise
        print('Account concurrency quota prevents reservation; endpoint remains IAM protected.')
    url = aws('lambda', 'get-function-url-config', '--function-name', NAME, allow_missing=True)
    if not url:
        url = aws('lambda', 'create-function-url-config', '--function-name', NAME, '--auth-type', 'AWS_IAM')
    schedule_role = role(NAME + '-scheduler', 'scheduler.amazonaws.com', {'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Action': 'lambda:InvokeFunction', 'Resource': function_arn}]})
    schedule = aws('scheduler', 'get-schedule', '--name', NAME, allow_missing=True)
    time.sleep(10)
    aws('scheduler', 'update-schedule' if schedule else 'create-schedule', '--name', NAME, '--schedule-expression', 'cron(0 9 * * ? *)', '--schedule-expression-timezone', 'Asia/Kolkata', '--flexible-time-window', '{"Mode":"OFF"}', '--state', 'ENABLED', '--target', json.dumps({'Arn': function_arn, 'RoleArn': schedule_role, 'Input': '{}', 'RetryPolicy': {'MaximumEventAgeInSeconds': 3600, 'MaximumRetryAttempts': 0}}), '--description', 'Portfolio links daily 09:00 IST; failures/unverified links emailed')
    print(json.dumps({'function': function_arn, 'function_url': url['FunctionUrl'], 'schedule': '09:00 Asia/Kolkata', 'email': EMAIL}))

if __name__ == '__main__':
    main()
