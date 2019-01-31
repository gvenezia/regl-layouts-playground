import * as d3 from 'd3';
const regl = require('regl')({
  // callback when regl is initialized
  onDone: main
}); 

// Main fires after regl is initialized at the bottom
function main(err, regl) {
  // Set constants
  const numPoints = 50000,
        pointWidth = 2,
        width  = window.innerWidth,
        height = window.innerHeight,
        duration = 1500; // 1500ms = 1.5s  

  // Random # Function
  const makeRandomNumber = d3.randomNormal(0, .5);

  // ==================  ==================
  // Helper() to layout green points
  function Layout1(points) {
    const rng = d3.randomNormal(0, 0.05);
    points.forEach((d, i) => {
      d.x = (Math.cos(i*155)) * (width / 2.5) + (width / 2);
      d.y = (Math.sin(i*153)) * (height / 2.5) + (height / 2);
      d.color = [1., 1., 1.]; 
    });
  }

  function Layout2(points) {
    points.forEach( (d, i) => {
      d.x = (Math.cos(i*5)) * (width/2) + (width / 2);
      d.y = (Math.sin(i*2)) * (height/2) + (height / 2);
      d.color = [1,.5, .5]
    })
  } 

  function Layout3(points) {
    points.forEach( (d, i) => {
      d.x = (makeRandomNumber() * Math.cos(i*13)) * (width/5) + (width / 2);
      d.y = (makeRandomNumber() * Math.sin(i*2)) * (height/5) + (height / 2);
      d.color = [Math.random(),Math.random(), Math.random()]
    })
  }

  // helper to layout points in a normally distributed area, colored blue
  function Layout4(points) {
    const rng = d3.randomNormal(0, 0.15);
    points.forEach(d => {
      d.x = (rng() * width) + (width / 2);
      d.y = (rng() * height) + (height / 2);
      d.color = [0, d.color[1] * 0.5, 0.9]; // some previous green and 0.9 blue
    });
  }

  // set the order of the layouts and some initial animation state
  const layouts = [Layout1, Layout2, Layout3, Layout4];
  let currentLayout = 0; // start with green circle layout

  // ======================= SET GLSL =====================
  // function for drawing the points
  // function to compile a draw points regl func
  function createDrawPoints(points) {
    const drawPoints = regl({
      frag: `
        precision highp float;

        varying vec3 fragColor;

        void main() {
          gl_FragColor = vec4(fragColor, 1);

          // // Code for creating a circle instead of a square
          // float r = 0.0, delta = 0.0, alpha = 1.0;
          // vec2 cxy = 2.0 * gl_PointCoord - 1.0;
          // r = dot(cxy, cxy);
          // if (r > 1.0) {
          //     discard;
          // }
          // gl_FragColor = vec4(fragColor, alpha);
        }
      `,

      vert: `
        attribute vec2 positionStart;
        attribute vec2 positionEnd;
        attribute vec3 colorStart;
        attribute vec3 colorEnd;

        // Varying type means the attribute can vary by point
        varying vec3 fragColor;

        uniform float pointWidth;
        uniform float stageWidth;
        uniform float stageHeight;
        uniform float elapsed;
        uniform float duration;

        // Normalize from pixel to normalized device coordinates (NDC)
        vec2 normalizeCoords(vec2 position) {
          // Read in the positions into x and y vars
          float x = position[0];
          float y = position[1];

          return vec2(
            2.0 * ((x / stageWidth) - 0.5),
            // invert y since we think [0,0] is bottom left in pixel space
            -(2.0 * ((y / stageHeight) - 0.5))
          );
        } 

        // Cubic Easing
        float easeCubicInOut(float t){
          t *= 2.0;
          t = (t <= 1.0 ? t*t*t : (t -= 2.0) * t*t + 2.0) / 2.0;

          if (t > 1.0) {
            t = 1.0;
          }

          return t;
        }

        void main(){
          gl_PointSize = pointWidth;

          // Declare time variable
          float t;

          // Check for !animation
          if (duration == 0.0){
            t = 1.0; // Go straight to end state
          } else {
            t = easeCubicInOut(elapsed / duration);
          }

          // Interpolate the position
          vec2 position = mix(positionStart, positionEnd, t);          

          // Interpolate the color
          fragColor = mix(colorStart, colorEnd, t);

          gl_Position = vec4( normalizeCoords(position), 0.0, 1.0);
        }
      `,

      // Attributes are mapped to the set of points assigned above
      // So each point has its own attributes
      attributes: { 
        positionStart: points.map(d => [d.sx, d.sy]),
        positionEnd: points.map(d => [d.tx, d.ty]),
        colorStart: points.map(d => d.colorStart),
        colorEnd: points.map(d => d.colorEnd)
      },

      // regl.prop takes a string and uses it to specify the argument part of the argument for the nesting function (drawPoints() in this case)
      uniforms: {
        pointWidth: regl.prop('pointWidth'),
        stageWidth: regl.prop('stageWidth'),
        stageHeight: regl.prop('stageHeight'),
        duration: regl.prop('duration'),
        elapsed: ( {time}, {startTime = 0} ) => (time - startTime) * 1000,
      },

      // Set # of points to draw
      count: points.length,

      primitive: 'points'
    }); // End drawPoints() = regl()

    return drawPoints;
  } // End createDrawPoints()


  function animate(layout, points) {
    // Set previous 'end' attributes to new 'start' attributes
    points.forEach( d => {
      d.sx = d.tx;
      d.sy = d.ty;
      d.colorStart = d.colorEnd;
    })

    // Position the points; update x, y, and color attrs
    layout(points);

    // Save the final state 'end' attrs
    points.forEach( d => {
      d.tx = d.x;
      d.ty = d.y;
      d.colorEnd = d.color;
    });

    // create the regl function with the new start and end points
    const drawPoints = createDrawPoints(points);

    let startTime = null; // recorded in seconds

    // Set up regl
    const frameLoop = regl.frame( ({time}) => {
      
      // Set startTime for reference
      if (startTime === null)
        startTime = time;

      // Clear buffer
      regl.clear({
        // Reset the background color to black
        color: [0,0,0,1],
        depth: 1
      });

      // Draw the points with reset properties
      drawPoints({
        pointWidth,
        stageWidth: width,
        stageHeight: height,
        duration,
        startTime
      });
     
      // If timeout, proceed to next animation
      if (time - startTime > (duration / 1000)) {
        console.log('done animating, moving to next layout');

        // cancel this loop, we are going to start another
        frameLoop.cancel();

        // increment to use next layout function
        currentLayout = (currentLayout + 1) % layouts.length;

        // start a new animation loop with next layout function
        animate(layouts[currentLayout], points);
      }

    })
  } // End animate()

  // Initial points as black in the center of the screen
  const points = d3.range(numPoints).map(i => ({
    tx: width / 2,
    ty: height / 2,
    colorEnd: [0, 0, 0],
  }));

  // start the initial animation
  animate(layouts[currentLayout], points);
} // End main()

// // initialize regl
// regl({
//   // callback when regl is initialized
//   onDone: main
// });