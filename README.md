# NRAlertLambdaWebhook
An AWS Lambda function to receive NR alerts, generate new content and send to Slack webhook.

The Lambda function leverages two environment variables:

1. NR_APP_ID: the New Relic application ID within your account

2. SLACK_WEBHOOCK_PATH: the path of your incoming Slack webhook. The complete path looks something like this: https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX. The content of this environment variable should just look like this '/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX'.
