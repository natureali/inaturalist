import React from "react";
import ReactDOM from "react-dom";
import moment from "moment-timezone";
import inaturalistjs from "inaturalistjs";
/* global L */

const CARTOCSS = `
  Map { }
  #layer {
    marker-width: 4;
    marker-fill: #74ac00;
    marker-fill-opacity: 0.6;
    [value > 2] { marker-width: 6; }
    [value > 4] { marker-width: 8; }
    [value > 6] { marker-width: 10; }
    [frame-offset = 1] {
      marker-width: 3;
      marker-fill-opacity: 0.2;
    }
    [frame-offset = 2] {
      marker-width: 2;
      marker-fill-opacity: 0.1;
    }
  }`;

class TorqueMap extends React.Component {

  constructor( ) {
    super( );
    this.centerMapOnResultBounds = this.centerMapOnResultBounds.bind( this );
    this.addTorqueLayer = this.addTorqueLayer.bind( this );
  }

  componentDidMount( ) {
    const map = this.setupMap( );
    this.centerMapOnResultBounds( map );
    const torqueLayer = this.addTorqueLayer( map );
    this.addKeydownListener( torqueLayer );
  }

  setupMap( ) {
    const map = new L.Map( $( ".map", ReactDOM.findDOMNode( this ) )[0], {
      zoomControl: true,
      center: [
        20,
        10
      ],
      zoom: 2,
      keyboard: false,
      scrollWheelZoom: false
    } );
    L.tileLayer( "https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_nolabels/{z}/{x}/{y}.png", {
      attribution: "CartoDB"
    } ).addTo( map );
    return map;
  }

  centerMapOnResultBounds( map ) {
    const { user, year } = this.props;
    const searchParams = {
      user_id: user ? user.id : null,
      year,
      return_bounds: true,
      per_page: 1
    };
    if ( user ) {
      inaturalistjs.observations.search( searchParams ).then( r => {
        map.fitBounds( [
          [r.total_bounds.nelat, r.total_bounds.nelng],
          [r.total_bounds.swlat, r.total_bounds.swlng]
        ] );
      } );
    }
  }

  addTorqueLayer( map ) {
    const { user, year, interval } = this.props;
    const torqueLayerParams = {
      user_id: user ? user.id : null,
      year,
      interval: interval || "weekly"
    };
    const apiURL = $( "meta[name='config:inaturalist_api_url']" ).attr( "content" );
    const torqueLayer = new L.TorqueLayer( {
      tileJSON: `${apiURL}/tiles.json?${$.param( torqueLayerParams )}`,
      cartocss: CARTOCSS,
      blendmode: "overlay",
      animationDuration: interval === "weekly" ? 26 : 12,
      zIndex: 10,
      map
    } );
    // update the date legend on slide changes
    const domNode = ReactDOM.findDOMNode( this );
    torqueLayer.on( "change:time", changes => {
      if ( interval === "weekly" ) {
        $( ".date", domNode ).text(
          moment( ).day( "Monday" ).week( changes.step ).format( "MMM DD" ) );
      } else {
        $( ".date", domNode ).text( moment.months( changes.step ) );
      }
    } );
    torqueLayer.addTo( map );
    // set a timeout before starting the slideshow
    setTimeout( ( ) => {
      torqueLayer.play( );
    }, 3000 );
    // toggle slideshow playing when clicking on the legend
    $( ".date", domNode ).on( "click", ( ) => {
      torqueLayer.toggle( );
    } );
    return torqueLayer;
  }

  addKeydownListener( torqueLayer ) {
    document.addEventListener( "keydown", event => {
      const currentStep = torqueLayer.getStep( );
      let nextKey;
      if ( event.keyCode === 32 ) {
        torqueLayer.toggle( );
      } else if ( event.keyCode === 37 ) {
        if ( torqueLayer.isRunning( ) ) { torqueLayer.stop( ); }
        nextKey = currentStep - 1;
        if ( nextKey < 0 ) {
          nextKey = torqueLayer.provider.options.data_steps - 1;
        }
        torqueLayer.setStep( nextKey );
      } else if ( event.keyCode === 39 ) {
        if ( torqueLayer.isRunning( ) ) { torqueLayer.stop( ); }
        nextKey = currentStep + 1;
        if ( nextKey >= torqueLayer.provider.options.data_steps ) {
          nextKey = 0;
        }
        torqueLayer.setStep( nextKey );
      }
    } );
  }

  render( ) {
    return (
      <div className="TorqueMap">
        <h3><span>{ I18n.t( "animated_observations_map" ) }</span></h3>
        <div className="map" />
        <div className="legend">
          <div className="date">{ I18n.t( "date_format.month.january" ) }</div>
        </div>
      </div>
    );
  }
}

TorqueMap.propTypes = {
  year: React.PropTypes.number,
  user: React.PropTypes.object,
  interval: React.PropTypes.string
};

export default TorqueMap;
