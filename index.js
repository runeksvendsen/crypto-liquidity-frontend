const host = 'cryptomarketdepth.com';
const basePath = '/api/v1';

var baseUrl;
if (window.location.protocol === 'file:') {
  baseUrl = 'http://' + host + basePath;
} else {
  baseUrl = basePath;
}

const detailsElem = document.getElementById('details');
const buySellPathsElem = document.getElementById('buy_sell_paths');

class Config {
  numeraire = 'USD';
  slippage = 0.5;
  crypto = 'all';
  limit = 10;
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
    return `run/_run_id_/paths/${this.numeraire}/${this.slippage}/%s`;
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
      buySellPathsElem.scrollIntoView();
    } else {
      do_it();
    }
}
window.onhashchange = locationHashChanged;

function parseDetailsJson(detailsJson) {
  const run = detailsJson[0];
  const data = detailsJson[1][0];
  const calcInfo = data[0];
  const pathList = data[1];
  let toPathDescr = (pathObj) =>
      {
        let pathStringList = Array.prototype.map.call(pathObj.currencys, function(currency, i) {
          let venue = pathObj.venues[i];
          return " --" + venue + "--> " + currency
          }
        );
        return pathObj.start + pathStringList.join("");
      }
  let qtyPath = (pathListElem) =>
      { let qty = pathListElem[0].qty;
        let pathDescr = pathListElem[1];
        return [qty, toPathDescr(pathDescr)]
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

let mkDataUrl = urlParams => baseUrl
      + '/liquidity/' + urlParams.crypto
      + `?slippage=${urlParams.slippage}&numeraire=${urlParams.numeraire}`
      + '&limit=' + urlParams.limit
      + (urlParams.fromDate ? '&from=' + urlParams.fromDate : '')
      + (urlParams.toDate ? "&to=" + urlParams.toDate : '');

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
  const urlParams = Config.fromWindowHash();
  createGraph(urlParams);
  createTimeSeries(urlParams);
}

async function createGraph(urlParams) {
  return vegaEmbed('#graph', mkGraphSpec(urlParams)).then(function(result) {
    // Access the Vega view instance (https://vega.github.io/vega/docs/api/view/) as result.view
  }).catch(console.error);
}

async function createTimeSeries(urlParams) {
  const yAxisLabel = `MM ${urlParams.numeraire} @ ${urlParams.slippage}% slippage`;
  var spec =
  {
    "$schema": "https://vega.github.io/schema/vega-lite/v4.json",
    "data": {
      "url": mkDataUrl(urlParams),
    },
    "format": {
        "parse": {
          "run.time_start": "time",
          "qty": "number",
          "currency": "string",
          "run_id": "number"
        }
      },
    "width": 700,
    "height": 450,
    "transform": [
      {"filter": "datum.qty != 0"},
      // {"filter": "datum.currency != \"TSD\""},
      // {"filter": "datum.currency != \"UST\""},
      // {"filter": "datum.currency != \"USDC\""},
      // {"filter": "datum.currency != \"USDT\""},
      // {"filter": "datum.currency != \"TUSD\""},
      // {"filter": "datum.currency != \"BTCB\""},
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
        { "field": "qty_mm",
          "title": yAxisLabel,
          "type": "quantitative"
        },
        {"field": "run.time_start", "title": "Time", "type": "temporal"},
        {"field": "run_id", "title": "Run ID", "type": "nominal"}
      ],
      "href": {"field": "url"}
    },
    "layer": [
      {
        "encoding": {
          "color": {
            "field": "currency",
            "type": "nominal",
            "title": "Currency"
          },
          "y": {
            "field": "qty_mm",
            "type": "quantitative",
            "title": yAxisLabel,
            "scale": {"type": "log"},
          }
        },
        "layer": [
          {"mark": "line"},
          {"mark": {
            "type": "point",
            "strokeWidth": 0
            }
          },
          {"transform":
            [{"filter": {"selection": "hover"}}],
            "mark": "line"
          }
        ]
      },
      {
        "transform": [{"pivot": "currency", "value": "qty_mm", "groupby": ["run.time_start"]}],
        "mark": "rule",
        "encoding": {
          "opacity": {
            "condition": {"value": 0.3, "selection": "hover"},
            "value": 0
          }
        },
        "selection": {
          "hover": {
            "type": "single",
            "fields": ["run.time_start"],
            "nearest": true,
            "on": "mouseover",
            "empty": "none",
            "clear": "mouseout"
          }
        }
      }
    ]
  }

  return vegaEmbed('#time_series', spec).then(function(result) {
    // Access the Vega view instance (https://vega.github.io/vega/docs/api/view/) as result.view
  }).catch(console.error);
}

function mkGraphSpec(urlParams) {
  var dataUrl = `${baseUrl}/run/newest/paths/${urlParams.numeraire}/${urlParams.slippage}/all?limit=200`;
  var json = {
    "$schema": "https://vega.github.io/schema/vega/v5.json",
    "description": "TODO",
    "width": 850,
    "height": 700,
    "padding": 0,
    "autosize": "none",
    "data": [
      {
        "name": "node-data",
        "url": dataUrl,
        "format": {"type": "json", "property": "nodes"},
        "transform": [
          {
            "type": "formula",
            "as": "shape",
            "expr": "datum.is_crypto ? 'circle' : 'square'"
          },
          {
            "type": "formula",
            "expr": `datum.name + ': ' + format(1e-6 * datum.qty, ',.4r') + 'm ${urlParams.numeraire}'`,
            "as": "node_tooltip_raw"
          },
          {
            "type": "formula",
            "expr": "datum.is_crypto ? datum.node_tooltip_raw : ''",
            "as": "node_tooltip"
          },
          {"type": "formula", "expr": "log(datum.qty)", "as": "qty_log"},
          {"type": "extent", "field": "qty_log", "signal": "qty_extent"},
          {
            "type": "formula",
            "expr": "(datum.qty_log - qty_extent[0] + 1) * nodeSize",
            "as": "node_radius_raw"
          },
          {
            "type": "formula",
            "expr": "datum.is_crypto ? datum.node_radius_raw : qty_extent[1] / 2",
            "as": "node_radius"
          },
          {
            "type": "formula",
            "expr": "datum.is_crypto ? scale('color', datum.name) : 'yellow'",
            "as": "node_color"
          },
          {
            "type": "formula",
            "expr": "datum.is_crypto ? 1 : 0.5",
            "as": "node_opacity"
          }
        ]
      },
      {
        "name": "link-data",
        "url": dataUrl,
        "format": {"type": "json", "property": "links"}
      }
    ],
    "signals": [
      {"name": "cx", "update": "width / 2"},
      {"name": "cy", "update": "height / 2"},
      // if the graph fits within a 500px box, how much should we multiply pixels sizes by
      //  if the box becomes "n" pixels instead?
      {"name": "size_factor", "update": "width / 500"},
      {
        "name": "nodeSize",
        "value": 2,
      },
      {
        "name": "nodeCharge",
        "value": -130
      },
      {
        "name": "linkWidth",
        "value": 7
      },
      {
        "name": "linkLength",
        "value": 80
      },
      {"name": "static", "value": false, "bind": {"input": "checkbox"}},
      {
        "description": "State variable for active node fix status.",
        "name": "fix",
        "value": false,
        "on": [
          {
            "events": "symbol:mouseout[!event.buttons], window:mouseup",
            "update": "false"
          },
          {
            "events": "symbol:mouseover",
            "update": "fix || true"
          },
          {
            "events": "[symbol:mousedown, window:mouseup] > window:mousemove!",
            "update": "xy()",
            "force": true
          }
        ]
      },
      {
        "description": "Graph node most recently interacted with.",
        "name": "node",
        "value": null,
        "on": [
          {"events": "symbol:mouseover", "update": "fix === true ? item() : node"}
        ]
      },
      {
        "description": "Flag to restart Force simulation upon data changes.",
        "name": "restart",
        "value": false,
        "on": [{"events": {"signal": "fix"}, "update": "fix && fix.length"}]
      },
      {
        "name": "symbol_hover_index",
        "value": null,
        "on": [
          {"events": "symbol:mouseover", "update": "datum.index"},
          {"events": "symbol:mouseout", "update": "null"}
        ]
      }
    ],
    "scales": [
      {"name": "color", "type": "ordinal", "range": {"scheme": "category20c"}},
      {
        "name": "edge_size",
        "type": "pow",
        "exponent": 0.3,
        "domain": {"data": "link-data", "field": "size"},
        "range": [1, {"signal": "linkWidth"}]
      }
    ],
    "marks": [
      {
        "name": "nodes",
        "type": "symbol",
        "zindex": 1,
        "from": {"data": "node-data"},
        "on": [
          {
            "trigger": "fix",
            "modify": "node",
            "values": "fix === true ? {fx: node.x, fy: node.y} : {fx: fix[0], fy: fix[1]}"
          },
          {"trigger": "!fix", "modify": "node", "values": "{fx: null, fy: null}"}
        ],
        "encode": {
          "enter": {
            "fill": {"field": "node_color"},
            "fillOpacity": {"field": "node_opacity"},
            "stroke": {"value": "white"}
          },
          "update": {
            "tooltip": {"field": "node_tooltip"},
            "size": {"signal": "datum.node_radius * datum.node_radius * 4"},
            "shape": {"field": "shape"},
            "cursor": {"value": "pointer"}
          }
        },
        "transform": [
          {
            "type": "force",
            "iterations": 300,
            "restart": {"signal": "restart"},
            "static": {"signal": "static"},
            "signal": "force",
            "forces": [
              {"force": "center", "x": {"signal": "cx"}, "y": {"signal": "cy"}},
              {"force": "collide", "radius": 14},
              {"force": "nbody", "strength": {"signal": "nodeCharge"}},
              {
                "force": "link",
                "links": "link-data",
                "distance": {"signal": "linkLength"}
              }
            ]
          }
        ]
      },
      {
        "type": "text",
        "zindex": 2,
        "from": {"data": "nodes"},
        "interactive": false,
        "encode": {
          "enter": {
            "fill": {"value": "blue"}
          },
          "update": {
            "fontSize": {"value": 10},
            "fontWeight": {"signal": "symbol_hover_index && symbol_hover_index === datum.datum.index ? 'bold' : 'normal'"},
            "y": {
              "field": "y",
              "offset": {"signal": "datum.datum.node_radius * -1.1"}
            },
            "x": {"field": "x"},
            "text": {"field": "datum.name"},
            "align": {"value": "center"}
          }
        }
      },
      {
        "type": "path",
        "zindex": 0,
        "from": {"data": "link-data"},
        "interactive": false,
        "encode": {
          "update": {
            "stroke": {
              "signal": "symbol_hover_index && (symbol_hover_index === datum.source.datum.index || symbol_hover_index === datum.target.datum.index) ? 'red' : 'black'"
            },
            "strokeWidth": {"scale": "edge_size", "field": "size"},
            "strokeOpacity": {
              "signal": "symbol_hover_index && (symbol_hover_index === datum.source.datum.index || symbol_hover_index === datum.target.datum.index) ? 0.40 : 0.1"
            },
            "strokeJoin": "round"
          }
        },
        "transform": [
          {
            "type": "linkpath",
            "require": {"signal": "force"},
            "shape": "line",
            "sourceX": "datum.source.x",
            "sourceY": "datum.source.y",
            "targetX": "datum.target.x",
            "targetY": "datum.target.y"
          }
        ]
      }
    ]
  };
  return json;
}