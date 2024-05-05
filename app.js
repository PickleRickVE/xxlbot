// libraries
const axios = require('axios');
const fs = require('fs');
const http = require('http');
const fetch = require('node-fetch');
const tl = require('./lang').tl;

// config
const config = require('./config');
var lang = {};
switch (config.lang) {
    case 'german':
        lang = tl[0]
        break;
    case 'english':
        lang = tl[1];
        break;
    default:
        lang = tl[1];
        break;
}

var master;
fetch('https://raw.githubusercontent.com/WatWowMap/Masterfile-Generator/master/master-latest-raw.json', {method: "Get"})
    .then(res => res.json())
    .then((json) => {
        master = json.pokemon;
        forms = json.forms;
    });

// webhook listener
const server = http.createServer((req, res) => {
    let body = [];
    req.on('data', chunk => {
        body.push(chunk);
    }).on('end', () => {
        body = Buffer.concat(body).toString();
        let values;
        let error;
        try {
            values = JSON.parse(body);
            error = false;
        } catch (e) {
            error = true;
        }
        if (!error) {  
            parseWebhook(values);
        }
        res.writeHead(200);
        res.end('Everything fine');
    });
});
server.listen(config.srv.port, config.srv.host, () => {
    console.log(`xxlbot is listening at http://${config.srv.host}:${config.srv.port}`);
});

// webhook parser
parseWebhook = async (values) => {
    for await (const element of values) {
        if (element.message.pokemon_id != undefined && element.message.size == 5) {
            let exIds = [133, 710, 711]; // excluded mon
            let xc = parseFloat((master[element.message.pokemon_id].sizeSettings[5].value/master[element.message.pokemon_id].height).toFixed(2));
            var evoId = 0;
            var evoXc = 0;
            if (!exIds.includes(element.message.pokemon_id) && master[element.message.pokemon_id].evolutions != undefined) {
                for await (const a of master[element.message.pokemon_id].evolutions) {
                    let evo1Id = a.evoId;
                    let xc1 = parseFloat((master[evo1Id].sizeSettings[5].value/master[evo1Id].height).toFixed(2));
                    if (xc > xc1) {
                        evoId = evo1Id;
                        evoXc = xc1;
                    }
                    if (master[evo1Id].evolutions != undefined) {
                        for await (const b of master[evo1Id].evolutions) {
                            let evo2Id = b.evoId;
                            let xc2 = parseFloat((master[evo2Id].sizeSettings[5].value/master[evo2Id].height).toFixed(2));
                            if (xc > xc2) {
                                evoId = evo2Id;
                                evoXc = xc2;
                            }
                        }
                    }
                }
            }
            if (xc < 2 || evoXc < 2 || element.message.pokemon_id == 133) { // Evoli evolutions all have 1.55 xxclass
                let pokemon = {
                    id: element.message.pokemon_id,
                    form: element.message.form,
                    atk: element.message.individual_attack,
                    def: element.message.individual_defense,
                    sta: element.message.individual_stamina,
                    lat: element.message.latitude,
                    lon: element.message.longitude,
                    weight: element.message.weight,
                    height: element.message.height,
                    cp: element.message.cp,
                    xc: xc,
                    time: element.message.disappear_time,
                    verified: element.message.disappear_time_verified,
                    evo: {
                        id: evoId,
                        xc: evoXc
                    }
                };
                processMon(pokemon);
            }
        }
    }
}

// get form & evolution, request calculation, trigger post to telegram & write log
processMon = (pokemon) => {
    // scanned data for calculation
    let data2 = {
        weight: pokemon.weight,
        height: pokemon.height,
        ivSum: (pokemon.atk + pokemon.def + pokemon.sta)
    }
    // additional calculation for evolutions
    let evoString = '';
    let evoMinScore = 0;
    let evoMaxScore = 0;
    if (pokemon.evo.id != 0) {
        if (pokemon.form != 0) {
            var data1 = getForm(pokemon.form, pokemon.evo.id);
        } else {
            var data1 = {
                avgWeight: master[pokemon.evo.id].weight,
                avgHeight: master[pokemon.evo.id].height,
                xc: pokemon.evo.xc,
                form: ''
            }
        }
        let result = calculate(data1, data2);
        evoMinScore = result.minScore.toFixed();
        evoMaxScore = result.maxScore.toFixed();
        evoString = `, ${lang.evo} ${lang.mon[pokemon.evo.id - 1]}: ${result.minScore.toFixed()}-${result.maxScore.toFixed()}`
    }
    // get data from master and calculate
    if (pokemon.form != 0) {
        var data1 = getForm(pokemon.form, pokemon.id);
        var result = calculate(data1, data2)
    } else {
        var data1 = {
            avgWeight: master[pokemon.id].weight,
            avgHeight: master[pokemon.id].height,
            xc: pokemon.xc,
            form: ''
        }
        var result = calculate(data1, data2)
    }
    let time = getTime(pokemon.time*1000)
    if ((result.minScore >= config.filter.minScore && result.wv >= config.filter.minWv) || (pokemon.evo.id != 0 && evoMinScore >= config.filter.minScore && result.wv >= config.filter.minWv)) {
        let obj = {
            id: pokemon.id,
            evo: pokemon.evo.id,
            form: data1.form,
            lat: pokemon.lat,
            lon: pokemon.lon,
            minScore: result.minScore,
            maxScore: result.maxScore,
            evoMinScore: evoMinScore,
            evoMaxScore: evoMaxScore,
            cp: pokemon.cp,
            timeString: time,
            time: pokemon.time,
            verified: pokemon.verified
        }
        postTg(obj);
    }
    let logTime = getTime();
    logMsg = `[${logTime}] ${data1.form}${lang.mon[pokemon.id - 1]} | variate: ${result.wv.toFixed(2)} | iv: ${(data2.ivSum / 45 * 100).toFixed()}% | range: ${result.minScore.toFixed()}-${result.maxScore.toFixed()}${evoString}`;
    console.log(logMsg)
    fs.writeFile(config.logFile, `${logMsg}\n`, {flag: 'a'}, error => {if (error) {console.log(error)}});
}

// identify form of mon
getForm = (form, id) => {
    var data1 = {};
    if (forms[form].formName != 'Normal') {
        data1 = {
            avgWeight: forms[form].weight != undefined ? forms[form].weight : master[id].weight,
            avgHeight: forms[form].height != undefined ? forms[form].height : master[id].height,
            xc: forms[form].sizeSettings != undefined ? parseFloat((forms[form].sizeSettings[5].value/forms[form].height).toFixed(2)) : parseFloat((master[id].sizeSettings[5].value/master[id].height).toFixed(2)),
            form: `${forms[form].formName} `
        }
    } else {
        data1 = {
            avgWeight: master[id].weight,
            avgHeight: master[id].height,
            xc: parseFloat((master[id].sizeSettings[5].value/master[id].height).toFixed(2)),
            form: ''
        }
    }
    return data1;
}

// calculate range of showcase score
calculate = (data1, data2) => {
    let vWeight = data2.weight/data1.avgWeight;
    let vHeight = data2.height/data1.avgHeight;
    let wv = Math.abs(vWeight-vHeight);
    //let avgScore = 800 * vHeight/data1.xc + 150 * (wv+vHeight)/(0.5+data1.xc) + 50 * data2.ivSum/45 + 7300/41; // scanned mon
    let minScore = 800 * 1.5/data1.xc + 150 * (wv+1.5)/(0.5+data1.xc) + 50 * data2.ivSum/45 + 7300/41;
    let maxScore = 800 + 150 * (wv+data1.xc)/(0.5+data1.xc) + 50 * data2.ivSum/45 + 7300/41;
    let result = {
        minScore: minScore,
        maxScore: maxScore,
        wv: wv
    }
    return result;
}

// time helper (hh:mm)
getTime = (time) => {
    let result = time != undefined ? new Date(time) : new Date();
    let minutes = result.getMinutes() < 10 ? '0' + result.getMinutes().toString() : result.getMinutes().toString();
    let hours = result.getHours() < 10 ? '0' + result.getHours().toString() : result.getHours().toString();
    result = hours + ':' + minutes;
    return result;
}

// telegram handling
var tgMsgs = []; // array to store telegram messages for deletion on expiration
postTg = (obj) => {
    let verified = obj.verified == true ? '\u2705' : '';
    let evo = obj.evo != 0 ? `\n${lang.evo} *${lang.mon[obj.evo - 1]}* ${obj.evoMinScore}-${obj.evoMaxScore}` : "";
    let msg = `*${obj.form}${lang.mon[obj.id - 1]}* (${obj.cp}${lang.cp}), score ${obj.minScore.toFixed()}-${obj.maxScore.toFixed()}${evo}\n${lang.avl} ${obj.timeString}${lang.clk} ${verified}`;
    axios.post(`https://api.telegram.org/bot${config.botToken}/sendMessage`, { 
        chat_id: config.channelID, 
        parse_mode: 'markdown', 
        disable_web_page_preview: false, 
        text: `${msg}[​](${config.tileServer}/staticmap/pokemon?id=${obj.id}&lat=${obj.lat}&lon=${obj.lon})\n[📍 Google Maps](https://maps.google.com/maps?&z=17&q=${obj.lat}+${obj.lon}&ll=${obj.lat}+${obj.lon})`
    })
    .then(response => {
        if (response.status == 200) {
            var msg = {
                id: response.data.result.message_id,
                monId: obj.id,
                time: obj.time
            }
        }
        tgMsgs.push(msg)
        let logTime = getTime();
        let logEvo = obj.evo != 0 ? ` / ${lang.mon[obj.evo - 1]}` : "";
        let logMsg = `[${logTime}] pushed ${obj.form}${lang.mon[obj.id - 1]}${logEvo} to telegram`;
        console.log(logMsg)
        fs.writeFile(config.logFile, logMsg + '\n', {flag: 'a'}, error => {if (error) {console.log(error)}});
    })
    .catch(error => {
        console.log(error)
    })
    let now = Math.floor(Date.now()/1000);
    for (let i = 0; i < tgMsgs.length; i++) {
        if (tgMsgs[i].time < now) {
            let result = delTg(tgMsgs[i].id, tgMsgs[i].monId);
            if (result) {
                tgMsgs.splice(i, 1);
            }
        }
    }
}

delTg = async (id, monId) => {
    var result;
    await axios.post(`https://api.telegram.org/bot${config.botToken}/deleteMessage`, { 
        chat_id: config.channelID, 
        message_id: id
    })
    .then(response => {
        if (response.data.result) {
            result = true;
        }
        let logTime = getTime();
        let logMsg = `[${logTime}] deleted msg #${id} with ${lang.mon[monId - 1]} on telegram`;
        console.log(logMsg)
        fs.writeFile(config.logFile, logMsg + '\n', {flag: 'a'}, error => {if (error) {console.log(error)}});
    })
    .catch(error => {
        let logTime = getTime();
        let logMsg = `[${logTime}] failed to delete msg #${id} with ${lang.mon[monId - 1]} on telegram`;
        console.log(logMsg)
        fs.writeFile(config.logFile, logMsg + '\n', {flag: 'a'}, error => {if (error) {console.log(error)}});
        result = false;
    })
    return result;
}