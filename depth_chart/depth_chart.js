var chart = null;

function ensureChartInit() {
  if (chart === null) {
    chart = initChart();
  }
}

const initChart = () =>
  AmCharts.makeChart("depth_chart", {
    "type": "serial",
    "theme": "light",
    "thousandsSeparator": " ",
    "titles": [{
      "text": "",
      "align": "middle",
      "bold": false,
      "size": 30,
      "tabIndex": 1
      },{
        "text": "",
        "align": "middle",
        "bold": false,
        "size": 17,
        "tabIndex": 1
      }
    ],
    "graphs": [{
      "id": "bids",
      "fillAlphas": 0.1,
      "lineAlpha": 1,
      "lineThickness": 2,
      "lineColor": "#0f0",
      "type": "step",
      "valueField": "bidstotalvolume",
      "balloonFunction": balloon
    }, {
      "id": "asks",
      "fillAlphas": 0.1,
      "lineAlpha": 1,
      "lineThickness": 2,
      "lineColor": "#f00",
      "type": "step",
      "valueField": "askstotalvolume",
      "balloonFunction": balloon
    }, {
      "lineAlpha": 0,
      "fillAlphas": 0.2,
      "lineColor": "#000",
      "type": "column",
      "clustered": false,
      "valueField": "bidsvolume",
      "showBalloon": false
    }, {
      "lineAlpha": 0,
      "fillAlphas": 0.2,
      "lineColor": "#000",
      "type": "column",
      "clustered": false,
      "valueField": "asksvolume",
      "showBalloon": false
    }],
    "categoryField": "value",
    "chartCursor": {},
    "balloon": {
      "textAlign": "left"
    },
    "valueAxes": [{
      "title": "Volume"
    }],
    "categoryAxis": {
      "title": "Price",
      "minHorizontalGap": 100,
      "startOnAxis": true,
      "showFirstLabel": false,
      "showLastLabel": false
    },
    "export": {
      "enabled": true
    }
  });

function postProcess(dataRaw) {
  const data = dataRaw.result;

  // Function to process (sort and calculate cummulative volume)
  function processData(list, type, desc) {

    // Convert to data points
    for(var i = 0; i < list.length; i++) {
      list[i] = {
        value: Number(list[i].price),
        volume: Number(list[i].qty),
      }
    }

    // Sort list just in case
    list.sort(function(a, b) {
      if (a.value > b.value) {
        return 1;
      }
      else if (a.value < b.value) {
        return -1;
      }
      else {
        return 0;
      }
    });

    // Calculate cummulative volume
    if (desc) {
      for(var i = list.length - 1; i >= 0; i--) {
        if (i < (list.length - 1)) {
          list[i].totalvolume = list[i+1].totalvolume + list[i].volume;
        }
        else {
          list[i].totalvolume = list[i].volume;
        }
        var dp = {};
        dp["value"] = list[i].value;
        dp[type + "volume"] = list[i].volume;
        dp[type + "totalvolume"] = list[i].totalvolume;
        res.unshift(dp);
      }
    }
    else {
      for(var i = 0; i < list.length; i++) {
        if (i > 0) {
          list[i].totalvolume = list[i-1].totalvolume + list[i].volume;
        }
        else {
          list[i].totalvolume = list[i].volume;
        }
        var dp = {};
        dp["value"] = list[i].value;
        dp[type + "volume"] = list[i].volume;
        dp[type + "totalvolume"] = list[i].totalvolume;
        res.push(dp);
      }
    }
  }

  // Init
  var res = [];
  processData(data.bids, "bids", true);
  processData(data.asks, "asks", false);

  return res;
}

function balloon(item, graph) {
  return balloonRaw(item, graph, "");
}

function balloonRaw(item, graph, baseTxt) {
  const ctx = item.dataContext;
  const totalVolume = graph.id == "asks" ? ctx.askstotalvolume : ctx.bidstotalvolume;
  const volume = graph.id == "asks" ? ctx.asksvolume : ctx.bidsvolume;

  const txt = "Price: <strong>" + formatNumber(ctx.value, graph.chart, 4) + "</strong><br />"
    + "Cumulative volume: <strong>" + formatNumber(totalVolume, graph.chart, 4) + " " + baseTxt + "</strong><br />"
    + "Volume: <strong>" + formatNumber(volume, graph.chart, 4) + " " + baseTxt + "</strong>";

  return txt;
}

function formatNumber(val, chart, precision) {
  return AmCharts.formatNumber(
    val,
    {
      precision: precision ? precision : chart.precision,
      decimalSeparator: chart.decimalSeparator,
      thousandsSeparator: chart.thousandsSeparator
    }
  );
}

function updateDataUrl(url, run_time_start) {
  fetch(url)
  .then(res => res.json())
  .then(out => { setDataSet(out, run_time_start) })
  .catch(err => { throw err; });
}

function setDataSet(jsonObject, run_time_start) {
  ensureChartInit();

  let res = jsonObject.result;

  if (res === null) {
    console.error("setDataSet: error: data not found.");
    return;
  }

  // Chart titles
  chart.titles[0].text = `${res.venue} ${res.base}/${res.quote}`; // Title
  const time = new Date(run_time_start);
  chart.titles[1].text = `${time.toLocaleDateString()} ${time.toLocaleTimeString()}`; // Subtitle

  // Axis titles
  chart.valueAxes[0].title = `Volume (${res.base})`;
  chart.categoryAxis.title = `Price (${res.quote} per ${res.base})`;

  // Balloon tip titles
  const balloonFun = (item, graph) => balloonRaw(item, graph, res.base);
  chart.graphs[0].balloonFunction = balloonFun;
  chart.graphs[1].balloonFunction = balloonFun;

  chart.dataProvider = postProcess(jsonObject);

  chart.validateData();
}
