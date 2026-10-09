"""Configure only daily knowledge permissions/environment; no account plan changes."""
import boto3
import json

session = boto3.Session(region_name='ap-south-1')
iam = session.client('iam')
iam.put_role_policy(
    RoleName='aws-elasticbeanstalk-ec2-role', PolicyName='nexus-daily-knowledge',
    PolicyDocument=json.dumps({'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Action': 'bedrock:InvokeModel', 'Resource': 'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-micro-v1:0'}]})
)
settings = {
    'DAILY_KNOWLEDGE_ENABLED': 'true',
    'DAILY_KNOWLEDGE_WORKSPACE_SLUG': 'private-workspace',
    'DAILY_KNOWLEDGE_OWNER_EMAIL': 'solanki.divyarajsinhp@gmail.com',
    'DAILY_KNOWLEDGE_MODEL_ID': 'amazon.nova-micro-v1:0',
    'DAILY_KNOWLEDGE_REGION': 'us-east-1',
}
response = session.client('elasticbeanstalk').update_environment(
    EnvironmentName='nexus-hub-prod',
    OptionSettings=[{'Namespace': 'aws:elasticbeanstalk:application:environment', 'OptionName': key, 'Value': value} for key, value in settings.items()],
)
print(json.dumps({'environment': response['EnvironmentName'], 'status': response['Status'], 'daily_knowledge': settings}))
