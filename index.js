const https = require('https');
// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');
// Set the region 
AWS.config.update({region: 'us-west-2'});

// Create the DynamoDB service object
const ddb = new AWS.DynamoDB({apiVersion: '2012-10-08'});

var NRQueryResultErrorClass = "";
var NRQueryResultAppId = "";
var DDBAlertConditionCountToday = 0;
var DDBAlertConditionCountYesterday = 0;

// function to retrieve Insights NRQL query result (currently just for facets)
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
                var insightsQueryResult = chunk.substring(0, chunk.indexOf(',"results":['));
                insightsQueryResult = insightsQueryResult.substring(20, insightsQueryResult.length-1);
                insightsCbSuccess(insightsQueryResult);
            });
    });
    req2.on("error", (error) => { 
        console.log('error: ' + error);
    });
    req2.end(); 
};

// main Lambda handler
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
    var dateStart = new Date(year, a.getMonth(), date, -2, 0, 0, 0);
    var dateStartPrevious = dateStart;
    dateStartPrevious.setDate(dateStartPrevious.getDate()-1);
    var dateStartTimestamp = dateStart.getTime().toString().substring(0, 10);
    var dateStartInsights = new Date(year, a.getMonth(), date, a.getHours(), a.getMinutes()-1, 0, 0);
    var dateStartInsightsTimestamp = dateStartInsights.getTime().toString().substring(0, 10);
    var dateEndTimestamp = json.timestamp.toString().substring(0, 10);
    
    // scan DynamoDB for existing alert today for the given alert condition
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
     TableName: process.env.DYNAMO_DB_TABLE_NAME
    };
    
    ddb.scan(paramsQuery, function(err, data) {
      if (err) {
        console.log("Error", err);
      } else {
        DDBAlertConditionCountToday = data.Items.length;
      }
    });
    
    /* Add item to NRAlertWebhook table */
    var paramsInsert = {
      TableName: process.env.DYNAMO_DB_TABLE_NAME,
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
        
    var DAILY_SLACK_MSGS_RESTRICT = process.env.DAILY_SLACK_MSGS_RESTRICT;
    var DAILY_SLACK_MSGS_MAX = parseInt(process.env.DAILY_SLACK_MSGS_MAX, 10);
    
    // did we already receive such an alert today (based on condition id)
    if (DAILY_SLACK_MSGS_RESTRICT == "true" &&
        DDBAlertConditionCountToday >= DAILY_SLACK_MSGS_MAX)
    {
        console.log("Alert Condition Count Today > 0, nothing to do for me!");
        // create Lambda response
        var responseNoSlack = {
            "statusCode": 200,
            "headers": {
                "my_header": "my_value"
            },
            "body": "",
            "isBase64Encoded": false
        };
        
        callback(null, responseNoSlack);
    }
    else
    {
        // retrieve total number of violations from DynamoDB
        var paramsQueryPrevious = {
          ExpressionAttributeValues: {
              ":d": {
                    S: dateStartPrevious.toString()
                   },
               ":c": {
                    N: json.condition_id.toString()
                   }
         },
         FilterExpression: "alert_date = :d and alert_condition_id = :c",
         ProjectionExpression: 'alert_date, alert_condition_id',
         TableName: process.env.DYNAMO_DB_TABLE_NAME
        };
        
        ddb.scan(paramsQueryPrevious, function(err, data) {
          if (err) {
            console.log("Error", err);
          } else {
            console.log("previous errors: "+data.Items.length+' from '+dateStartPrevious.toString()+' for '+json.condition_id.toString());
            DDBAlertConditionCountYesterday = data.Items.length;
          }
        });
        
        // NR application ID within the json.account_id
        var applicationID = process.env.NR_APP_ID;
        if (targetsJson.id != "TransactionError")
        {
            applicationID = targetsJson.id;
        }
        
        var insightsNRQLFacetErrorClass = 'SELECT%20uniqueCount(%60error.class%60)%20from%20TransactionError%20%20%20SINCE%20'+dateStartInsightsTimestamp+'%20UNTIL%20'+dateEndTimestamp+'%20facet%20%60error.class%60';
        var insightsNRQLFacetAppId = 'SELECT%20uniqueCount(%60error.class%60)%20from%20TransactionError%20%20%20SINCE%20'+dateStartInsightsTimestamp+'%20UNTIL%20'+dateEndTimestamp+'%20facet%20appId';
        
        var insightsURLFacetErrorClass = 'https://insights.newrelic.com/accounts/'+json.account_id+'/query?query='+insightsNRQLFacetErrorClass;
        var insightsURLFacetAppId = 'https://insights.newrelic.com/accounts/'+json.account_id+'/query?query='+insightsNRQLFacetAppId;

        // retrieve Error Class from Insights using NRQL query     
        queryInsightsError (json.account_id, insightsNRQLFacetErrorClass, function(ret) {
                if (ret) {
                  console.log(`response from insights error class: ${ret}`);
                  NRQueryResultErrorClass = ret;
                }
              });

        // for NRQL alerts we also need to retrieve APM App Id from Insights using NRQL query
        if (targetsJson.product == "NRQL")
        {
            queryInsightsError (json.account_id, insightsNRQLFacetAppId, function(ret) {
                if (ret) {
                  console.log(`response from insights app id: ${ret}`);
                  NRQueryResultAppId = ret;
                }
              });
              
            if (NRQueryResultAppId != null &&
                NRQueryResultAppId != "")
            {
                applicationID = NRQueryResultAppId;
            }
        }

        // is there a better way to wait for the Insights queries to complete?
        setTimeout(() => console.log(".5 seconds passed"), 500);

        // create APM URL based on collected information
        var apmURL = 'https://rpm.newrelic.com/accounts/'+json.account_id+'/applications/'+applicationID+'/filterable_errors?tw%5Bstart%5D='+dateStartTimestamp+'&tw[end]='+dateEndTimestamp;
        if (NRQueryResultErrorClass != null &&
            NRQueryResultErrorClass != "")
        {
            apmURL = 'https://rpm.newrelic.com/accounts/'+json.account_id+'/applications/'+applicationID+'/filterable_errors?tw%5Bstart%5D='+dateStartTimestamp+'&tw[end]='+dateEndTimestamp+'#/table?top_facet=transactionUiName&primary_facet=error.class&barchart=barchart&filters=%5B%7B%22key%22%3A%22error.class%22%2C%22value%22%3A%22'+NRQueryResultErrorClass+'%22%2C%22like%22%3Afalse%7D%5D';
        }
        
        var conditionUrl = json.policy_url + "/conditions/"+targetsJson.condition_id+"/edit";
    
        // generate Slack webhook values
        const payload = JSON.stringify({
            'channel': '#nr_alerts_webhooks',
            'username': 'New Relic Alert',
            'text': 
                'Product: '+targetsJson.product+'\n'+
                'Alert Violation for Account: '+json.account_name+'\n'+
                '<'+targetsJson.link+'|'+targetsJson.name+'> triggered <'+conditionUrl+'|'+json.condition_name+'> in <'+json.policy_url+'|'+json.policy_name+'>\n'+
                '*Threshold*\n'+
                json.details+'\n'+
                '*Number of violations received yesterday:* '+DDBAlertConditionCountYesterday+'\n',
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
                            "text": "Insights NRQL",
                            "type": "button",
                            "url": insightsURLFacetErrorClass
                        },
                        {
                            "text": "Edit condition",
                            "type": "button",
                            "url": conditionUrl
                        },
                        {
                            "text": "View incident",
                            "type": "button",
                            "url": json.incident_url
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
