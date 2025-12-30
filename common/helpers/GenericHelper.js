function GetCamelToe(str) {
    var onlyLetters = str.replace(/[^a-zA-Z]+/g, '');

    if (onlyLetters) {
        return onlyLetters.charAt(0).toUpperCase() + onlyLetters.slice(1).toLowerCase();
    }
    else {
        return str;
    }
}

function GetParams(params) {
    params = params.split("&");
    var paramsMap = {};
    params.forEach(function (p) {
        var v = p.split("=");
        paramsMap[v[0]] = decodeURIComponent(v[1]);
    });
    return paramsMap;
};

const argsHandler = (msgContent) => {
    const args = msgContent.split(" ");

    if (args.length == 1) {
        msg.reply("Please provide a character name");
        return;
    }

    const realm = args[2] ? args[2] : "icecrown";

    return { args, realm };
};



module.exports = { argsHandler, GetCamelToe, GetParams }