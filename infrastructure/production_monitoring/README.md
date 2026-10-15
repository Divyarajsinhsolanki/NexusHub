# Production logs and failure email alerts

Run `python3 infrastructure/production_monitoring/deploy.py` with the configured AWS CLI credentials. It is idempotent, applies monitoring resources in Mumbai, and updates only Elastic Beanstalk monitoring settings. The environment must be Ready. The configuration update can restart environment services; it does not request an application version change or run migrations itself.

- Environment: `nexus-hub-prod`.
- Sender: `noreply@divyarajsinh.com`; recipient: `solanki.divyarajsinhp@gmail.com`.
- EventBridge sends EB ERROR events and named CloudWatch ALARM transitions to an isolated SES forwarding Lambda. No SNS subscription confirmation is needed. The Lambda only emails; it never remediates infrastructure or modifies application data.
- Health alarm: Degraded/Severe for three consecutive minutes. Brief health transitions and 4xx-only Warning periods are not independently alerted.
- Application alarm: at least five HTTP 5xx responses within five minutes.
- EC2 alarm: failed instance status checks in two of three minutes. Setup discovers current instances; rerun after instance replacement to refresh per-instance alarms. Environment health coverage remains independent of instance IDs.
- Deployment, Rails stdout, Nginx, and environment health logs: seven-day retention. Log streaming is also declared in `.ebextensions/02_monitoring.config` for later releases.
- Email events are best-effort AWS service events; short-lived service metrics can arrive with a delay. There is no automatic application rollback.

## Verify

```
python3 -m unittest discover -s infrastructure/production_monitoring -p 'test_*.py'
aws cloudwatch describe-alarms --region ap-south-1 --alarm-name-prefix nexus-hub-prod-
aws logs describe-log-groups --region ap-south-1 --log-group-name-prefix /aws/elasticbeanstalk/nexus-hub-prod/
aws lambda invoke --region ap-south-1 --function-name nexus-hub-prod-failure-alerts --payload '{"test_email":true}' /tmp/monitoring-email.json
```

The email command is an explicit setup test and sends one email. It uses AWS CLI v1 payload syntax; CLI v2 additionally needs `--cli-binary-format raw-in-base64-out`.

## Cost

The setup adds three standard alarms for the current single instance, one enhanced-health custom metric, one small ARM64 Lambda and two EventBridge rules. These are generally within the account's currently unused free allowances at low traffic. SES and logging beyond available free allowances consume credits. Seven-day retention limits storage, not ingestion; high request volume or verbose/error logs can increase costs. No paid dashboards, anomaly detection, detailed EC2 monitoring, or periodic log queries are enabled.
