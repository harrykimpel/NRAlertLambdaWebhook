const https = require('https');
// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');
// Set the region 
AWS.config.update({region: 'us-west-2'});

// Create the DynamoDB service object
const ddb = new AWS.DynamoDB({apiVersion: '2012-10-08'});

var NRQueryResult = "";
var DDBAlertConditionCountToday = 0;

var queryInsightsError = function (account, nrql, insightsCbSuccess)
{
  var options = {
      host: 'insights-api.newrelic.com',
      path: '/v1/accounts/'+account+'/query?nrql='+nrql,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Query-Key': process.env.NR_INSIGHTS_QUERY_KEY
      }
  };

  const req2 = https.request(options,
    function(res) { 
            res.setEncoding('utf-8');
            res.on("data", function (chunk) {
                //console.log('BODY: ' + chunk);
                var NRQueryResult = chunk.substring(0, chunk.indexOf(',"results":['));
                //console.log('NRQueryResult1: ' + NRQueryResult);
                NRQueryResult = NRQueryResult.substring(20, NRQueryResult.length-1);
                //console.log('NRQueryResult2: ' + NRQueryResult);
                insightsCbSuccess(NRQueryResult);
            /*(res) => res.on("data", function (chunk) {
                var NRQueryResult = chunk;
                //console.log('BODY: ' + chunk);
                insightsCbSuccess(chunk);*/
            });
    });
    req2.on("error", (error) => { 
        console.log('error: ' + error);
    });
    req2.end(); 
};

exports.handler = (event, context, callback) => {

    // receive webhook values from NR
    var json = JSON.parse(event.body);
    var targets = json.targets;
    var targetsType = json.targetsType;
    targetsType = targetsType.replace('.TYPE', '');
    targetsType = targetsType.substr(1).slice(0, -1); // remove first and last character ([ and ])
    targetsType = targetsType.replace('[', '%5B');
    targetsType = targetsType.replace(']', '%5D');
    console.log("targetsType: ", targetsType);
    var targetsJson = JSON.parse(targetsType);
    console.log('targets id', targetsJson.id);

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
    var dateStart = new Date(year, a.getMonth(), date, -1, 0, 0, 0);
    var dateStartTimestamp = dateStart.getTime().toString().substring(0, 10);
    var dateStartInsights = new Date(year, a.getMonth(), date, a.getHours(), a.getMinutes()-2, 0, 0);
    var dateStartInsightsTimestamp = dateStartInsights.getTime().toString().substring(0, 10);
    var dateEndTimestamp = json.timestamp.toString().substring(0, 10);
    
    
    var paramsQuery = {
      ExpressionAttributeValues: {
          ":d": {
                S: dateStart.toString()
               },
           ":c": {
                N: json.condition_id.toString()
               }
     },
     FilterExpression: "alert_date = :d and alert_condition_id = :c",
     ProjectionExpression: 'alert_date, alert_condition_id',
     TableName: 'NRAlertWebhook'
    };
    
    ddb.scan(paramsQuery, function(err, data) {
      if (err) {
        console.log("Error", err);
      } else {
        //console.log("DB query count: "+data.Items.length);
        DDBAlertConditionCountToday = data.Items.length;
        /*data.Items.forEach(function(element, index, array) {
          //console.log(element.alert_date.S + " (" + element.alert_condition_id.S + ")");
          DDBAlertConditionCountToday++;
        });*/
      }
    });
    
    //console.log("DDBAlertConditionCountToday: "+DDBAlertConditionCountToday);
    if (DDBAlertConditionCountToday > 0)
    {
        console.log("Alert Condition Count Today > 0, nothing to do for me!");
        // create Lambda response
        var response = {
            "statusCode": 200,
            "headers": {
                "my_header": "my_value"
            },
            "body": "",
            "isBase64Encoded": false
        };
        
        callback(null, response);
    }
    else
    {
        /* Add item to NRAlertWebhook table */
        var paramsInsert = {
          TableName: 'NRAlertWebhook',
          Item: {
            'alert_timestamp' : {S: json.timestamp.toString()},
            'alert_date' : {S: dateStart.toString()},
            'alert_condition_id' : {N: json.condition_id.toString()}
          }
        };
        
        // Call DynamoDB to add the item to the table
        ddb.putItem(paramsInsert, function(err, data) {
          if (err) {
            console.log("Error", err);
          } else {
            console.log("Success", data);
          }
        });
        
        // NR application ID within the json.account_id
        var applicationID = process.env.NR_APP_ID;
        if (targetsJson.id != "TransactionError")
        {
            applicationID = targetsJson.id;
        }
        var insightsNRQL = 'SELECT%20uniqueCount(%60error.class%60)%20from%20TransactionError%20%20%20SINCE%20'+dateStartInsightsTimestamp+'%20UNTIL%20'+dateEndTimestamp+'%20facet%20%60error.class%60';
        var insightsURL = 'https://insights.newrelic.com/accounts/'+json.account_id+'/query?query='+insightsNRQL;
        
        /*var NRQueryResultPromise = getInsightsErrors (json.account_id, insightsNRQL);
        NRQueryResultPromise.then(function(result) {
            NRQueryResult = result;
            console.log('response from insights 1: '+NRQueryResult);
        }, function(err) {
            console.log(err);
        });
        console.log('response from insights 2: '+NRQueryResult);*/
        queryInsightsError (json.account_id, insightsNRQL, function(ret) {
                if (ret) {
                  //console.log(`response from insights: ${ret}`);
                  NRQueryResult = ret;
                }
              });
        setTimeout(() => console.log(".5 seconds passed"), 500);
        //console.log('response from insights: '+NRQueryResult);
        /*var optionsNR = {
          host: 'insights-api.newrelic.com',
          path: '/v1/accounts/'+json.account_id+'/query?nrql='+insightsNRQL,
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-Query-Key': process.env.NR_INSIGHTS_QUERY_KEY
          }
      };*/
    
      /*https.request(optionsNR, function(res) {
        console.log('STATUS: ' + res.statusCode);
        console.log('HEADERS: ' + JSON.stringify(res.headers));
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
              console.log('BODY: ' + chunk);
              //insightsCb(chunk);
        }).end();
      }); */
        /*const req2 = https.request(optionsNR,
            (res) => res.on("data", function (chunk) {
                var NRQueryResult = chunk;
                //console.log('BODY: ' + chunk);
          }));
        req2.on("error", (error) => { 
            console.log('error: ' + error);
        });
        req2.end();*/
        
        /*var apmURL = 'https://rpm.newrelic.com/accounts/'+json.account_id+
                    '/applications/'+applicationID+'/filterable_errors#/show//stack_trace?top_facet=transactionUiName&primary_facet=error.class'+
                    '&tw[start]='+dateStartInsightsTimestamp+
                    '&tw[end]='+dateEndTimestamp+
                    '&barchart=barchart&filters=%5B%7B%22key%22%3A%22error.class%22%2C%22value%22%3A%22Error%22%2C%22like%22%3Afalse%7D%5D';*/
        /*var apmURL = 'https://rpm.newrelic.com/accounts/'+json.account_id+
                    '/applications/'+applicationID+'/filterable_errors#/table?top_facet=transactionUiName&primary_facet=error.class'+
                    '&tw[start]='+dateStartTimestamp+
                    '&tw[end]='+dateEndTimestamp+
                    '&barchart=barchart&filters=%5B%7B%22key%22%3A%22error.class%22%2C%22value%22%3A%22Error%22%2C%22like%22%3Afalse%7D%5D';*/
        var apmURL = 'https://rpm.newrelic.com/accounts/'+json.account_id+'/applications/'+applicationID+'/filterable_errors?tw%5Bstart%5D='+dateStartTimestamp+'&tw[end]='+dateEndTimestamp;
        if (NRQueryResult != null &&
            NRQueryResult != "")
        {
            apmURL = 'https://rpm.newrelic.com/accounts/'+json.account_id+'/applications/'+applicationID+'/filterable_errors?tw%5Bstart%5D='+dateStartTimestamp+'&tw[end]='+dateEndTimestamp+'#/table?top_facet=transactionUiName&primary_facet=error.class&barchart=barchart&filters=%5B%7B%22key%22%3A%22error.class%22%2C%22value%22%3A%22'+NRQueryResult+'%22%2C%22like%22%3Afalse%7D%5D';
        }
        
        var conditionUrl = targetsJson.policy_url + "/conditions/"+targetsJson.condition_id+"/edit";
    
        // generate Slack webhook values
        const payload = JSON.stringify({
            'channel': '#nr_alerts_webhooks',
            'username': 'webhookbot',
            'text': 
                'product: '+targetsJson.product+'\n'+
                'dateStart: '+dateStart.toString()+'\n'+
                'dateStartTimestamp: '+dateStartTimestamp+'\n'+
                'dateStartInsights: '+dateStartInsights.getTime().toString()+'\n'+
                'dateStartInsightsTimestamp: '+dateStartInsightsTimestamp+'\n'+
                'dateEnd: '+a.toString()+'\n'+
                'dateEndTimestamp: '+dateEndTimestamp+'\n'+
                'target URL: '+targetsJson.link+'\n'+
                'APM Errors: '+apmURL+'\n'+
                'Insights Errors: '+insightsURL+'\n'+
                'Insights NRQL: '+insightsNRQL+'\n'+
                'Insights query result: '+NRQueryResult+'\n'+
                'release: 1.40.13'+'\n'+
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
                ', timestamp: '+json.timestamp+'\n'+
                ', violation_chart_url: '+json.violation_chart_url,
            'icon_emoji': ':ghost:',
            "attachments": [
                {
                    "title": "Violation Chart",
                    "image_url": json.violation_chart_url
                },
                {
                    "color": "#3AA3E3",
                    "attachment_type": "default",
                    "actions": [
                        {
                            "text": "APM Error analytics",
                            "type": "button",
                            "url": apmURL
                        },
                        {
                            "text": "Edit condition",
                            "type": "button",
                            "url": conditionUrl
                        }
                    ]
                }
            ]
        });
        
        // options for sending to Slack
        const options = {
          hostname: "hooks.slack.com",
          method: "POST",
          path: process.env.SLACK_WEBHOOCK_PATH,
        };
        
        // error response body
        var responseBodyErr = {
            "error": "something did not work",
        };
    
        // error response from call to Slack
        var responseErr = {
            "statusCode": 200,
            "headers": {
                "my_header": "my_value",
            },
            "body": JSON.stringify(responseBodyErr),
            "isBase64Encoded": false
        };
        
        // send data to Slack
        const req = https.request(options,
            (res) => res.on("data", function (chunk) {
          }));
        req.on("error", (error) => callback(null, responseErr));
        req.write(payload);
        req.end();
     
        // create Lambda response body
        var responseBody = {
            "accountID": json.account_id,
            "timestamp": json.timestamp,
            "time": time,
            "dateStartTimestamp": dateStartTimestamp.substring(0,10),
            "dateEndTimestamp": dateEndTimestamp.substring(0,10)
        };
    
        // create Lambda response
        var response = {
            "statusCode": 200,
            "headers": {
                "my_header": "my_value"
            },
            "body": JSON.stringify(responseBody),
            "isBase64Encoded": false
        };
        
        callback(null, response);
    }
};
