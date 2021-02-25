// 'cryptomarketdepth.com'
const baseUrl = 'http://' + '35.221.4.161' + '/api/v1';
const detailsElem = document.getElementById('details');

class Config {
  numeraire = 'USD';
  slippage = 0.5;
  crypto = 'all';
  limit = 18;
  toDate = null;
  fromDate = null;
  detailRunId = null;

  constructor(params) {
    this.numeraire = params.get('numeraire') || this.numeraire;
    this.slippage = params.get('slippage') || this.slippage;
    this.crypto = params.get('crypto') || this.crypto;
    this.limit = params.get('limit') || this.limit;
    this.toDate = params.get('to') || this.toDate;
    this.fromDate = params.get('from') || this.fromDate;
    this.detailRunId = params.get('detailRunId') || this.detailRunId;
  }

  static fromWindowHash() {
    return new Config(new URLSearchParams(window.location.hash.substring(1)));
  }

  toUrl() {
    return (new URLSearchParams(this)).toString();
  }

  pathsNumeraireSlippage() {
    const pathBaseUrl = 'liquidity/test_paths/';
    const params = new URLSearchParams({ "numeraire" : this.numeraire, "slippage" : this.slippage, "run_id": "_run_id_"});
    return `${pathBaseUrl}%s?${params.toString()}`;
  }
}

async function locationHashChanged() {
    const hashLoc = window.location.hash.substring(1);
    console.log("locationHashChanged: " + hashLoc);

    // check is "details"
    if (hashLoc.substring(0,2) === "d:") {
      const urlParams = hashLoc.substring(2);
      const fetchPromise = fetch(baseUrl + '/' + urlParams);
      // TODO: enable for "detailsElem" here
      const resp = await fetchPromise;
      const detailsJson = await resp.json();
      // TODO: update "detailsElem" with "urlParams"
      detailsElem.innerHTML = mkDetailsTable(parseDetailsJson(detailsJson));
      detailsElem.scrollIntoView();
    }
}
window.onhashchange = locationHashChanged;

function parseDetailsJson(detailsJson) {
  const content = detailsJson[0];
  const run = content[0];
  const data = content[1][0];
  const calcInfo = data[0];
  const pathList = data[1];
  let qtyPath = (pathListElem) =>
      { let qty = pathListElem[0].qty;
        let pathDescr = pathListElem[1];
        return [qty, pathDescr]
      }
  return [[calcInfo.currency, calcInfo.numeraire, run.id], pathList.map(qtyPath)];
}

function mkDetailsTable (pathInfo) {
  const currency = pathInfo[0][0];
  const numeraire = pathInfo[0][1];
  const runId = pathInfo[0][2];
  const pathList = pathInfo[1];
  const qtySum = pathList.reduce((sum, x) => sum + x[0], 0);
  const tableRows =
    pathList.map(qtyPath =>
        `<tr>
          <td>${numberWithCommas(qtyPath[0])}</td>
          <td>${qtyPath[1]}</td>
        </tr>`
      ).join("\n");
  return `<table>
      <caption>Table: amount per path for ${currency} (run ${runId})</caption>
      <thead>
        <tr>
          <th>Amount (${numeraire})</th>
          <th>Path</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
      <tfoot>
        <tr>
          <td>${numberWithCommas(qtySum)}</td>
          <td>Sum</td>
        </tr>
      </tfoot>
    </table>`;
}

const urlParams = Config.fromWindowHash();

let mkDataUrl = urlParams => baseUrl
      + '/liquidity/' + urlParams.crypto
      + '?slippage=0.5&numeraire=USD'
      + '&limit=' + urlParams.limit
      + (urlParams.fromDate ? '&from=' + urlParams.fromDate : '')
      + (urlParams.toDate ? "&to=" + urlParams.toDate : '');
let numeraireSlippage = `slippage=${urlParams.slippage}&numeraire=${urlParams.numeraire}`;

function uniq(a) {
    return a.sort().filter(function(item, pos, ary) {
        return !pos || item != ary[pos - 1];
    });
}

// source: https://stackoverflow.com/a/2901298/700597
function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

var calcCountQueue = [];
function movingAverageDiff(size, calcCount, timestamp) {
    calcCountQueue.push([calcCount, timestamp]);
    if (calcCountQueue.length === 1) return null;
    if (calcCountQueue.length > size) calcCountQueue.shift();
    const arrayCopy = calcCountQueue.slice();
    const oldestVal = arrayCopy.shift();
    const newestVal = arrayCopy.pop();
    const countDiff = oldestVal[0] - newestVal[0];
    const timeDiff = newestVal[1] - oldestVal[1];
    return countDiff / (timeDiff / 1000);
}

async function runUpdateCount() {
  let unfinishedCount = document.getElementById('unfinished_count');
  async function updateCounter() {
    const resp = await fetch(baseUrl + '/calc/unfinished/count');
    const time = Date.now();
    const calcCount = await resp.json();
    unfinishedCount.innerHTML = numberWithCommas(calcCount);
    // moving average
    const movingAvgRate = movingAverageDiff(10, calcCount, time);
    const rateText = movingAvgRate ? movingAvgRate.toFixed(1) : '?';
    unfinishedCount.innerHTML = unfinishedCount.innerHTML + ' (' + rateText + ' calc/sec)';
  }
  await updateCounter();
  setInterval(updateCounter, 5000);
}

async function do_it() {
  var spec =
  {
    "$schema": "https://vega.github.io/schema/vega/v4.json",
    "width": 700,
    "height": 450,
    "padding": {"left": 5, "right": 5, "top": 0, "bottom": 20},
    "autosize": "none",
    "signals": [
      {	"name": "signal_exponent_y_axis",
        "value": 1.0,
        "bind": {
              "input": "range",
              "name": "Y-axis scale",
              "min": 0.5,
              "max": 1.0,
              "step": 0.5
            }
      }
    ],
    "data": {
      "url": mkDataUrl(urlParams),
      "name": "my_data"
    },
    "format": {
        "parse": {
          "run.time_start": "date",
          "qty": "number",
          "currency": "string",
          "run_id": "number"
        }
      },
    "transform": [
      {"filter": "datum.currency != \"TSD\""},
      {"filter": "datum.currency != \"UST\""},
      {"filter": "datum.currency != \"USDC\""},
      {"filter": "datum.currency != \"USDT\""},
      {"filter": "datum.currency != \"TUSD\""},
      {"filter": "datum.currency != \"BTCB\""},
      {"filter": "datum.run_id != 1"},
      {"calculate": "1e-6 * datum.qty", "as": "qty_mm"},
      {"calculate": `'#d:' + replace(replace("${urlParams.pathsNumeraireSlippage()}", "%s", datum.currency), "_run_id_", datum.run_id)`, "as": "url"}
    ],
    "encoding": {
      "x": {
        "field": "run.time_start",
        "type": "temporal",
        "title": "Time"
      },
      "tooltip": [
        {"field": "currency", "title": "Currency", "type": "nominal"},
        {"field": "qty_mm", "title": "Quantity (MM USD)", "type": "quantitative"},
        {"field": "run.time_start", "title": "Time", "type": "temporal"},
        {"field": "run_id", "title": "Run ID", "type": "nominal"}
      ],
      "href": {"field": "url"}
    },

    "scales": [
      {
        "name": "scale_x_axis",
        "type": "point",
        "range": "width",
        "domain": {"data": "my_data", "field": "run.time_start"}
      },
      {
        "name": "scale_y_axis",
        "type": "pow",
        "exponent": {"signal": "signal_exponent_y_axis" },
        "domain": {	"data": "my_data", "field": "qty_mm"},
        "range": "height",

        "nice": true
      },
      {
        "name": "color",
        "type": "ordinal",
        "range": "category",
        "domain": {"data": "my_data", "field": "currency"}
      }
    ],

    "axes": [
      {"orient": "bottom", "scale": "scale_x_axis"},
      {"orient": "left", "scale": "scale_y_axis", "grid":true}
    ],

    "marks": [
      {
        "type": "group",
        "from": {
          "facet": {
            "name": "series",
            "data": "my_data",
            "groupby": "run.time_start"
          }
        },
        "marks": [
          {
            "type": "line",
            "from": {"data": "series"},
            "encode": {
              "update": {
                "x": {"scale": "scale_x_axis", "field": "run.time_start"},
                "y": {"scale": "scale_y_axis", "field": "qty_mm"},
                "stroke": {"scale": "color", "field": "c"},
                "strokeWidth": {"value": 2},
                "fillOpacity": {"value": 1}
              },
              "hover": {
                "fillOpacity": {"value": 0.5}
              }
            }
          }
        ]
      }
    ]

    // "layer": [
    //   {
    //     "encoding": {
    //       "color": {"field": "currency", "type": "nominal", "title": "Currency"},
    //       "y": {
    //         "field": "qty_mm",
    //         "type": "quantitative",
    //         "title": "Quantity (MM USD)",
    //         "scale": {"type": {"signal": "log_scale"}},
    //       }
    //     },
    //     "layer": [
    //       {"mark": "line"},
    //       {"mark": "point"},
    //       {"transform":
    //         [{"filter": {"selection": "hover"}}],
    //         "mark": "line"
    //       }
    //     ]
    //   },
    //   {
    //     "transform": [{"pivot": "currency", "value": "qty_mm", "groupby": ["run.time_start"]}],
    //     "mark": "rule",
    //     "encoding": {
    //       "opacity": {
    //         "condition": {"value": 0.3, "selection": "hover"},
    //         "value": 0
    //       }
    //     },
    //     "selection": {
    //       "hover": {
    //         "type": "single",
    //         "fields": ["run.time_start"],
    //         "nearest": true,
    //         "on": "mouseover",
    //         "empty": "none",
    //         "clear": "mouseout"
    //       }
    //     }
    //   }
    // ]
  }

  vegaEmbed('#vis', spec).then(function(result) {
    // Access the Vega view instance (https://vega.github.io/vega/docs/api/view/) as result.view
  }).catch(console.error);
}