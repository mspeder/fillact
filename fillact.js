var CLIENT_ID = '270024842630-fiuhtnlp4i3urno9o8b4294qkt6fqbm5.apps.googleusercontent.com';
var CLIENT_SECRET = 'Ilj5T0VoBq1sbXNg_s9tPatk';
var REDIRECT_URL = 'urn:ietf:wg:oauth:2.0:oob';

var PREF_GOOGLETOKENS = 'googleTokens';
var PREF_SFPASSWORD = 'sfPassword';
var PREF_RULES = 'rules';

var SETYPES = [	'DISCovery',
				'DEMO/presentation delivery',
				'Demo PREP',
				'OPPortunity support',
				'ACCount support',
				'PILOT/poc/trial',
				'RFP/rfi/rfq',
				'IGNite',
				'internal STRATegy',
				'AE enablement',
				'PARTner support',
				'MARKeting event',
				'CLOUD assets',
				'INDustry assets',
				'TRAVel',
				'personal DEVelopment',
				'FOUNDation',
				'OTHer',
				'NO'];

var prompt = require('prompt');
prompt.message = '';
prompt.delimiter = '';

if (typeof localStorage === "undefined" || localStorage === null) {
  //var LocalStorage = require('node-localstorage').LocalStorage;
  //localStorage = new LocalStorage('./localStorage');

  var Storage = require('dom-storage');
  localStorage = new Storage('./localStorage.json', { strict: false, ws: '  ' });
}


var google = require('googleapis');
var calendar = google.calendar('v3');
var jsforce = require('jsforce');

var beginTime;
var endTime;

var googletokens;
var googleoauth2Client;
var googleEvents = [];

var sfuser;
var sfpassword;
var sfconnection;
var sfUserId;
var sfEvents = [];

var rules;

start();

function start() {
	prompt.start();
	askDate();
}

function askDate() {
	beginTime = new Date();
	beginTime.setDate(beginTime.getDate()-7);
	endTime = new Date();
	endTime.setDate(endTime.getDate()+0);
	console.log('Events from '+beginTime+' to '+endTime);

	loadGoogleTokens();
}

function loadGoogleTokens() {

	googleoauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
	googletokens = JSON.parse(localStorage.getItem(PREF_GOOGLETOKENS));

	if (googletokens == null) {
		console.log('empty');
		getGoogleTokens();
	} else {
		gotGoogleTokens();
	}
}

function getGoogleTokens() {
	var scopes = [
	  'https://www.googleapis.com/auth/calendar.readonly'
	];

	var url = googleoauth2Client.generateAuthUrl({access_type: 'offline', scope: scopes });

	console.log('Visit the url : ', url);

	prompt.get([{description : 'Enter the code here :', name: 'code', hidden: false, required: true}], function(err, result) {
	    googleoauth2Client.getToken(result.code, function(err, tokens) {
	      googletokens = tokens;
	      localStorage.setItem(PREF_GOOGLETOKENS, JSON.stringify(googletokens));
	      gotGoogleTokens();
	    });
	  });
	}

function gotGoogleTokens() {
	console.log('Creating connection to GCal');
	googleoauth2Client.setCredentials(googletokens);

	console.log('Getting GCal events');
	getGoogleEvents(beginTime.toISOString(),endTime.toISOString(),null);
}

function getGoogleEvents(timemin,timemax,pagetoken) {

	var params = {
	        calendarId: 'primary',
	        maxResults: 250,
	        timeMin: timemin  ,
	        timeMax: timemax ,
	        singleEvents: true,
	        fields : 'description,items(status,description,htmlLink,attendees(displayName,email),summary,visibility,start,end),nextPageToken,summary',
	        auth: googleoauth2Client
	      };
	if (pagetoken != null) {
		params.pageToken = pagetoken;
	}
	calendar.events.list(params, function(err, events) {
	        if(err) {
	          console.log('Error fetching google events');
	          end();
	        } else {
	          for(var idx in events.items) {
	          	var item = events.items[idx];

	          	if (typeof item.summary == 'undefined') continue;
	          	if (item.visibility == 'private') continue;

	          	item.lookup = item.summary+' '+item.description;
	          	for (var att in item.attendees) {
	          		var attendee = item.attendees[att];
	          		if (typeof attendee.displayName != 'undefined') item.lookup = item.lookup + ' ' + attendee.displayName;
	          		if (typeof attendee.email != 'undefined') item.lookup = item.lookup + ' ' + attendee.email;
	          	}
	          	item.lookup = item.lookup.toLowerCase();
	          	item.rulematched = [];
	          	googleEvents.push(item);
	          }
	          sfuser = events.summary;
	          var nextPageToken = events.nextPageToken;
	          if (typeof nextPageToken  == 'undefined') {
	          	gotGoogleEvents();
	          } else {
	          	getGoogleEvents(timemin,timemax,nextPageToken);
	          }
	        }
	    });
}

function gotGoogleEvents() {
	console.log('Got '+googleEvents.length+' GCal events');
	loadSFTokens();
}

function loadSFTokens() {
	sfpassword = localStorage.getItem(PREF_SFPASSWORD);
	if (sfpassword == null) {
		askSFPassword();
	} else {
		sfpassword = new Buffer(sfpassword, 'base64').toString('utf8');
		connectSF();
	}

}

function askSFPassword() {

	prompt.get([{description : 'Enter Org62 password :', name: 'password', hidden: true, required: true}], function(err, result) {
		sfpassword = result.password;
		localStorage.setItem(PREF_SFPASSWORD,new Buffer(sfpassword).toString('base64'));
		connectSF();
		});
}

function connectSF() {

	console.log('Creating connection to Salesforce');
	sfconnection = new jsforce.Connection();
	sfconnection.login(sfuser, sfpassword , function(err, res) {
 	if (err) { 
	  	console.error('Unable to login to SF : '+ err);
	  	askSFPassword();
	  	return;
	  }
	  gotSFConnect();
	});

}

function gotSFConnect() {
 	getSFUserId();
  }

function getSFUserId() {
	console.log('Getting SF UserId');
	sfconnection.query("SELECT Id FROM User WHERE Username = '"+sfuser+"'", function(err, res) {
    if (err) { 
    	console.error(err);
    	end();
    	}
    	sfUserId = res.records[0].Id;
    	console.log(sfUserId);
    	getSFEvents();
	  });
}

function getSFEvents() {
	console.log('Getting SF events');
	sfconnection.query("SELECT AccountId,Subject,Description,EndDateTime,Id,OwnerId,StartDateTime,WhatId FROM Event WHERE OwnerId = '"
		+sfUserId+"' AND StartDateTime >= "+beginTime.toISOString()+" AND EndDateTime <= "+endTime.toISOString(), function(err, res) {
    if (err) { 
    	console.error(err);
    	end();
    	}
    	sfEvents = res.records;
    	gotSFEvents();
	  });
}

function gotSFEvents() {
    console.log('Got '+sfEvents.length+' SF events');
    deleteSFEvents();
}

function deleteSFEvents() {

	if (sfEvents.length==0) {
		deletedSFEvents();
		return;
	}
	var evtid = sfEvents[0].Id;
	var evtsubj = sfEvents[0].Subject;
	sfEvents.shift();
	console.log('Deleting SF Event '+evtid+' ('+evtsubj+')');
	sfconnection.sobject("Event").del(evtid, 
		function(err, rets) {
			if (err) { return console.error(err); end();}
			deleteSFEvents();
		});
}

function deletedSFEvents() {
	matchRules();
}

function matchRules() {
	rules = JSON.parse(localStorage.getItem(PREF_RULES));
	if (rules == null) fillDefaultRules();

	for(var r in rules) {
		 rule = rules[r];
		 rule.match = rule.match.toLowerCase();
		}

	matchRule(0);
	
}

function matchRule(index) {

	if (index >= googleEvents.length) {
		createSFEvents();
		return;
	}
	var evt = googleEvents[index];

		console.log('Filling Event "'+evt.summary+'"');

		for(var r in rules) {
			var rule = rules[r];
			if (evt.lookup.indexOf(rule.match)>-1) {
				//Rule matched !
				evt.rulematched.push(rule);
				if (typeof rule.what != 'undefined' && typeof evt.rulewhat == 'undefined') evt.rulewhat = rule.what;
				if (typeof rule.keep != 'undefined' && typeof evt.rulekeep == 'undefined') evt.rulekeep = rule.keep;
				if (typeof rule.setype != 'undefined' && typeof evt.rulesetype == 'undefined') evt.rulesetype = rule.setype;
				if (rule.stop == true) break;
			}

		}

		var ms = '';
		var next = false;
		for(var m in evt.rulematched) {
			var rm = evt.rulematched[m]
			if (next) {
				ms = ms+', ';
			} else {
				next = true;
			}
			ms = ms+rm.match;
		}

		console.log('   Start time    : ' + evt.start.dateTime);
		console.log('   Rules matched : ' + ms);
		if (typeof evt.rulesetype == 'undefined') {
			evt.rulesetype = querySEType(index);
		} else {
			console.log('   SETask        : ' + evt.rulesetype);
			matchRuleStep2(index);
		}


		/*
		if (typeof evt.rulesetype == 'undefined') evt.rulesetype = 'Other';
		if (typeof evt.rulekeep == 'undefined') evt.rulekeep = true;
		*/
}

function matchRuleStep2(index) {
	var evt = googleEvents[index];
	console.log('   What          : ' + evt.rulewhat);
	console.log('   Keep          : ' + evt.rulekeep);
	matchRule(index+1);
}

function querySEType(index) {
	var evt = googleEvents[index];

	prompt.get([{description : '   SETask        :', name: 'setype'}], function(err, result) {
		
		var ans='';
		var search = result.setype.toUpperCase();
		if (search != '') for(var i in SETYPES) {
			var sety = SETYPES[i];
			if (sety.toUpperCase().indexOf(search)>-1) {
				ans=sety;
				break;
				}
			}

		if (ans == '') {
			for(var i in SETYPES) {
				var sety = SETYPES[i];
				console.log('                   '+sety);
			}
			querySEType(index);
			return;
		}
		if (ans == 'NO') {
			evt.rulekeep = false;
		}

		evt.rulesetype = ans;
		matchRuleStep2(index);
		});
}

function fillDefaultRules() {
	rules = [
		{	match : 'Fortnightly France SE Call',
			setype : 'Internal Strategy',
			stop : true	},
		{	match : 'CATech',
			what : '0013000000HF6KA' },
		{	match : 'CA Tech',
			what : '0013000000HF6KA' },
		{	match : '@ca-tech',
			what : '0013000000HF6KA' }
	];
	console.log(JSON.stringify(rules));
	//localStorage.setItem(PREF_RULES, JSON.stringify(rules));
}

function createSFEvents() {
	if (googleEvents.length==0) {
		createdSFEvents();
		return;
	}
	var evt = googleEvents[0];
	googleEvents.shift();
	//console.log(evt);

	if (evt.rulekeep == false) {
		createSFEvents();
		return;
	}

	console.log('Creating SF Event "'+evt.summary+'"');

	var sfevt ={
		OwnerId : sfUserId,
		Subject : evt.summary,
		Description : evt.htmlLink+'\n\n'+evt.description+'\n\nSynced by FillAct',
		StartDateTime : evt.start.dateTime,
		EndDateTime : evt.end.dateTime,
		SE_Task_Type__c : evt.rulesetype
	};

	if (typeof evt.rulewhat != 'undefined') sfevt.WhatId = evt.rulewhat;
	
	sfconnection.sobject("Event").create(sfevt, 
		function(err, rets) {
			if (err) { return console.error(err); end();}
			createSFEvents();
		});
}

function createdSFEvents() {
	end();
}

function end() {
	console.log('Done.');
	process.exit(0);
}
