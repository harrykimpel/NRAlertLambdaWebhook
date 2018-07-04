const https = require('https');

exports.handler = (event, context, callback) => {
    
    // receive webhook values from NR
    var json = JSON.parse(event.body);
    var targets = json.targets;
    
    var a = new Date(json.timestamp);
    
    // some date and time preparation
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var year = a.getFullYear();
    var month = months[a.getMonth()];
    var date = a.getDate();
    var hour = a.getHours();
    var min = a.getMinutes();
    var sec = a.getSeconds();
    var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec ;
    var dateStart = new Date(year, a.getMonth(), date, 0, 0, 0, 0);
    var dateStartTimestamp = dateStart.getTime().toString().substring(0, 10);
    var dateStartInsights = new Date(year, a.getMonth(), date, a.getHours(), a.getMinutes()-2, 0, 0);
    var dateStartInsightsTimestamp = dateStartInsights.getTime().toString().substring(0, 10);
    var dateEndTimestamp = json.timestamp.toString().substring(0, 10);
    
    var applicationID = "123456789";
    
    const payload = JSON.stringify({
        'channel': '#nr_alerts_webhooks',
        'username': 'webhookbot',
        'text': 
            'dateStartTimestamp: '+dateStartTimestamp+
            ', dateEndTimestamp: '+dateEndTimestamp+
            ', dateStartInsightsTimestamp: '+dateStartInsightsTimestamp+
            ', account_id: '+json.account_id+
            ', account_name: '+json.account_name+
            ', condition_id: '+json.condition_id+
            ', condition_name: '+json.condition_name+
            ', current_state: '+json.current_state+
            ', details: '+json.details+
            ', event_type: '+json.event_type+
            ', incident_acknowledge_url: '+json.incident_acknowledge_url+
            ', incident_id: '+json.incident_id+
            ', incident_url: '+json.incident_url+
            ', owner: '+json.owner+
            ', policy_name: '+json.policy_name+
            ', policy_url: '+json.policy_url+
            ', runbook_url: '+json.runbook_url+
            ', severity: '+json.severity+
            ', targets: '+targets+
            ', targets.type: '+json.targetsType+
            ', timestamp: '+json.timestamp+
            ', violation_chart_url: '+json.violation_chart_url+
            ', https://rpm.newrelic.com/accounts/'+json.account_id+
                '/applications/'+applicationID+'/filterable_errors#/show//stack_trace?top_facet=transactionUiName&primary_facet=error.class'+
                '&tw[start]='+dateStartInsightsTimestamp+
                '&tw[end]='+dateEndTimestamp+
                '&barchart=barchart&filters=%5B%7B%22key%22%3A%22error.class%22%2C%22value%22%3A%22Error%22%2C%22like%22%3Afalse%7D%5D',
        'icon_emoji': ':ghost:',});
    
    const options = {
      hostname: "hooks.slack.com",
      method: "POST",
      path: "/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
    };
    
    var responseBodyErr = {
        "error": "this did not work",
    };

    var responseErr = {
        "statusCode": 200,
        "headers": {
            "my_header": "my_value",
        },
        "body": JSON.stringify(responseBodyErr),
        "isBase64Encoded": false
    };
    
    const req = https.request(options,
        (res) => res.on("data", function (chunk) {
      }));
    req.on("error", (error) => callback(null, responseErr));
    req.write(payload);
    req.end();
 
    var responseBody = {
        "accountID": json.account_id,
        "timestamp": json.timestamp,
        "time": time,
        "dateStartTimestamp": dateStartTimestamp.substring(0,10),
        "dateEndTimestamp": dateEndTimestamp.substring(0,10)
    };

    var response = {
        "statusCode": 200,
        "headers": {
            "my_header": "my_value"
        },
        "body": JSON.stringify(responseBody),
        "isBase64Encoded": false
    };
    
    callback(null, response);
};
