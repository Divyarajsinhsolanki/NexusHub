"""Idempotent production logs/alerts setup. No application release or DB writes."""
import json
import pathlib
import subprocess
import sys
import tempfile
import time
import zipfile

REGION = 'ap-south-1'
ENVIRONMENT = 'nexus-hub-prod'
NAME = ENVIRONMENT + '-failure-alerts'
SENDER = 'noreply@divyarajsinh.com'
RECIPIENT = 'solanki.divyarajsinhp@gmail.com'
HERE = pathlib.Path(__file__).resolve().parent


def aws(*args, allow_missing=False):
    result = subprocess.run(['aws', *args, '--region', REGION, '--output', 'json'], capture_output=True, text=True)
    if result.returncode:
        if allow_missing and any(code in result.stderr for code in ['NoSuchEntity', 'ResourceNotFoundException', 'ResourceNotFound']):
            return None
        raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout) if result.stdout.strip() else {}


def configure_logging():
    current = aws('elasticbeanstalk', 'describe-environments', '--environment-names', ENVIRONMENT)['Environments'][0]
    if current['Status'] != 'Ready':
        print(json.dumps({'logging_update': 'deferred', 'environment_status': current['Status']}), flush=True)
        return
    environment_id = current['EnvironmentId']
    settings = aws('elasticbeanstalk', 'describe-configuration-settings', '--application-name', current['ApplicationName'], '--environment-name', ENVIRONMENT)['ConfigurationSettings'][0]['OptionSettings']
    config_value = next((setting['Value'] for setting in settings if setting['Namespace'] == 'aws:elasticbeanstalk:healthreporting:system' and setting['OptionName'] == 'ConfigDocument'), '{}')
    config = json.loads(config_value)
    config.setdefault('CloudWatchMetrics', {}).setdefault('Environment', {})['ApplicationRequests5xx'] = 60
    config.setdefault('Version', 1)
    options = []
    for namespace in ['aws:elasticbeanstalk:cloudwatch:logs', 'aws:elasticbeanstalk:cloudwatch:logs:health']:
        options += [{'Namespace': namespace, 'OptionName': name, 'Value': value} for name, value in [('StreamLogs' if namespace.endswith(':logs') else 'HealthStreamingEnabled', 'true'), ('RetentionInDays', '7'), ('DeleteOnTerminate', 'false')]]
    options += [{'Namespace': 'aws:elasticbeanstalk:healthreporting:system', 'OptionName': 'SystemType', 'Value': 'enhanced'}, {'Namespace': 'aws:elasticbeanstalk:healthreporting:system', 'OptionName': 'ConfigDocument', 'Value': json.dumps(config)}]
    current_options = {(setting['Namespace'], setting['OptionName']): setting.get('Value') for setting in settings}
    def unchanged(option):
        previous = current_options.get((option['Namespace'], option['OptionName']))
        if option['OptionName'] == 'ConfigDocument' and previous:
            return json.loads(previous) == json.loads(option['Value'])
        return previous == option['Value']
    changed = [option for option in options if not unchanged(option)]
    if changed:
        update = aws('elasticbeanstalk', 'update-environment', '--environment-name', ENVIRONMENT, '--option-settings', json.dumps(changed))
        print(json.dumps({'configuration_update': update['Status'], 'environment_id': environment_id}), flush=True)


def main():
    account = aws('sts', 'get-caller-identity')['Account']
    current = aws('elasticbeanstalk', 'describe-environments', '--environment-names', ENVIRONMENT)['Environments'][0]
    if '--logging-only' in sys.argv:
        configure_logging()
        return
    environment_id = current['EnvironmentId']
    resources = aws('elasticbeanstalk', 'describe-environment-resources', '--environment-name', ENVIRONMENT)['EnvironmentResources']
    instances = [entry['Id'] for entry in resources['Instances']]
    alarm_names = [ENVIRONMENT + '-health', ENVIRONMENT + '-server-errors'] + [ENVIRONMENT + '-ec2-' + instance for instance in instances]
    identity = aws('sesv2', 'get-email-identity', '--email-identity', 'divyarajsinh.com')
    if not identity.get('VerifiedForSendingStatus'):
        raise RuntimeError('The SES sender domain is not verified.')
    role_name = NAME + '-execution'
    existing_role = aws('iam', 'get-role', '--role-name', role_name, allow_missing=True)
    if not existing_role:
        existing_role = aws('iam', 'create-role', '--role-name', role_name, '--assume-role-policy-document', json.dumps({'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Service': 'lambda.amazonaws.com'}, 'Action': 'sts:AssumeRole'}]}))
    role_arn = existing_role['Role']['Arn']
    email_resources = [f'arn:aws:ses:{REGION}:{account}:identity/divyarajsinh.com']
    if identity.get('ConfigurationSetName'):
        email_resources.append(f'arn:aws:ses:{REGION}:{account}:configuration-set/{identity["ConfigurationSetName"]}')
    policy = {'Version': '2012-10-17', 'Statement': [
        {'Effect': 'Allow', 'Action': ['logs:CreateLogStream', 'logs:PutLogEvents'], 'Resource': f'arn:aws:logs:{REGION}:{account}:log-group:/aws/lambda/{NAME}:*'},
        {'Effect': 'Allow', 'Action': 'ses:SendEmail', 'Resource': email_resources, 'Condition': {'StringEquals': {'ses:FromAddress': SENDER}, 'ForAllValues:StringEquals': {'ses:Recipients': [RECIPIENT]}}}
    ]}
    aws('iam', 'put-role-policy', '--role-name', role_name, '--policy-name', NAME, '--policy-document', json.dumps(policy))
    groups = ['/aws/lambda/' + NAME] + [f'/aws/elasticbeanstalk/{ENVIRONMENT}/{path}' for path in ['var/log/eb-engine.log', 'var/log/eb-hooks.log', 'var/log/web.stdout.log', 'var/log/nginx/access.log', 'var/log/nginx/error.log', 'environment-health.log']]
    for group in groups:
        try:
            aws('logs', 'create-log-group', '--log-group-name', group)
        except RuntimeError as error:
            if 'ResourceAlreadyExistsException' not in str(error):
                raise
        aws('logs', 'put-retention-policy', '--log-group-name', group, '--retention-in-days', '7')
    environment = {'Variables': {'ENVIRONMENT_NAME': ENVIRONMENT, 'ALARM_NAMES': json.dumps(alarm_names), 'SENDER_EMAIL': SENDER, 'ALERT_EMAIL': RECIPIENT}}
    function = aws('lambda', 'get-function-configuration', '--function-name', NAME, allow_missing=True)
    with tempfile.TemporaryDirectory() as directory:
        archive = pathlib.Path(directory) / 'function.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
            package.write(HERE / 'lambda_function.py', 'lambda_function.py')
            package.write(HERE.parent / 'email_templates.py', 'email_templates.py')
        if function:
            aws('lambda', 'update-function-code', '--function-name', NAME, '--zip-file', 'fileb://' + str(archive))
            aws('lambda', 'wait', 'function-updated-v2', '--function-name', NAME)
            aws('lambda', 'update-function-configuration', '--function-name', NAME, '--environment', json.dumps(environment), '--role', role_arn)
        else:
            for attempt in range(8):
                try:
                    aws('lambda', 'create-function', '--function-name', NAME, '--runtime', 'python3.12', '--handler', 'lambda_function.lambda_handler', '--architectures', 'arm64', '--memory-size', '128', '--timeout', '30', '--role', role_arn, '--environment', json.dumps(environment), '--zip-file', 'fileb://' + str(archive))
                    break
                except RuntimeError as error:
                    if 'cannot be assumed' not in str(error) or attempt == 7:
                        raise
                    time.sleep(5)
    aws('lambda', 'wait', 'function-active-v2', '--function-name', NAME)
    aws('lambda', 'wait', 'function-updated-v2', '--function-name', NAME)
    function_arn = f'arn:aws:lambda:{REGION}:{account}:function:{NAME}'
    patterns = {
        ENVIRONMENT + '-deployment-failures': {'source': ['aws.elasticbeanstalk'], 'account': [account], 'region': [REGION], 'detail': {'EnvironmentName': [ENVIRONMENT], 'Severity': ['ERROR']}},
        ENVIRONMENT + '-alarm-failures': {'source': ['aws.cloudwatch'], 'account': [account], 'region': [REGION], 'detail-type': ['CloudWatch Alarm State Change'], 'detail': {'alarmName': alarm_names, 'state': {'value': ['ALARM']}}}
    }
    for rule, pattern in patterns.items():
        rule_arn = aws('events', 'put-rule', '--name', rule, '--event-pattern', json.dumps(pattern), '--state', 'ENABLED')['RuleArn']
        try:
            aws('lambda', 'add-permission', '--function-name', NAME, '--statement-id', rule, '--action', 'lambda:InvokeFunction', '--principal', 'events.amazonaws.com', '--source-arn', rule_arn, '--source-account', account)
        except RuntimeError as error:
            if 'ResourceConflictException' not in str(error):
                raise
        response = aws('events', 'put-targets', '--rule', rule, '--targets', json.dumps([{'Id': 'email-alert', 'Arn': function_arn, 'RetryPolicy': {'MaximumEventAgeInSeconds': 3600, 'MaximumRetryAttempts': 2}}]))
        if response.get('FailedEntryCount'):
            raise RuntimeError('EventBridge target setup failed.')
    common = ['--comparison-operator', 'GreaterThanOrEqualToThreshold', '--treat-missing-data', 'missing', '--actions-enabled']
    aws('cloudwatch', 'put-metric-alarm', '--alarm-name', alarm_names[0], '--alarm-description', 'Degraded/Severe production health for three minutes; EventBridge sends SES email.', '--namespace', 'AWS/ElasticBeanstalk', '--metric-name', 'EnvironmentHealth', '--dimensions', 'Name=EnvironmentName,Value=' + ENVIRONMENT, '--statistic', 'Maximum', '--period', '60', '--evaluation-periods', '3', '--datapoints-to-alarm', '3', '--threshold', '20', *common)
    aws('cloudwatch', 'put-metric-alarm', '--alarm-name', alarm_names[1], '--alarm-description', 'Five or more application HTTP 5xx responses in five minutes; EventBridge sends SES email.', '--namespace', 'AWS/ElasticBeanstalk', '--metric-name', 'ApplicationRequests5xx', '--dimensions', 'Name=EnvironmentName,Value=' + ENVIRONMENT, '--statistic', 'Sum', '--period', '300', '--evaluation-periods', '1', '--datapoints-to-alarm', '1', '--threshold', '5', *common)
    for instance in instances:
        aws('cloudwatch', 'put-metric-alarm', '--alarm-name', ENVIRONMENT + '-ec2-' + instance, '--alarm-description', 'EC2 status check failure in two of three minutes; EventBridge sends SES email. Rerun setup after instance replacement.', '--namespace', 'AWS/EC2', '--metric-name', 'StatusCheckFailed', '--dimensions', 'Name=InstanceId,Value=' + instance, '--statistic', 'Maximum', '--period', '60', '--evaluation-periods', '3', '--datapoints-to-alarm', '2', '--threshold', '1', *common)
    configure_logging()
    print(json.dumps({'function': function_arn, 'rules': list(patterns), 'alarms': alarm_names, 'sender': SENDER, 'recipient': RECIPIENT}), flush=True)

if __name__ == '__main__':
    main()
