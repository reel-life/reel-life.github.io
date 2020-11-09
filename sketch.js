// Resources shared between instances:
let box;
let reel;
let play, playPressed;
let tape;
let copy;
let sliderLine;
let sliderButton;
let font;

let scaleVal = 5;

let firstInstance = true

const reelToReel = (id, postsetup) => (sketch) => {
  sketch.preload = () => {
    if (firstInstance) {
      // Load assets
      box = sketch.loadImage("assets/box.png");
      reel = sketch.loadImage("assets/reel.png");
      play = sketch.loadImage("assets/playButton.png");
      playPressed = sketch.loadImage("assets/playButtonPressed.png")
      tape = sketch.loadImage("assets/tape.png");
      copy = sketch.loadImage("assets/copyButton.png");
      copyPressed = sketch.loadImage("assets/copyButtonPressed.png");
      sliderLine = sketch.loadImage("assets/sliderLine.png");
      sliderButton = sketch.loadImage("assets/sliderButton.png");
      font = sketch.loadFont('assets/orcaext.ttf');
    }
  }

  sketch.setup = () => {
    sketch.createCanvas(270, 270)
    // Resize assets
    if (firstInstance) {
      reel.resize(reel.width / (scaleVal * 2), 0);
      box.resize(box.width / scaleVal, 0);
      play.resize(play.width / scaleVal / 1.5, 0);
      playPressed.resize(playPressed.width / scaleVal / 1.5, 0);
      copy.resize(copy.width / 2, 0);
      copyPressed.resize(copyPressed.width / 2, 0);
      tape.resize((tape.width / scaleVal) * 1.09, 0);
      sliderLine.resize(sliderLine.width / scaleVal, 0);
      sliderButton.resize(sliderButton.width / scaleVal, 0);
      firstInstance = false
    }

    sketch.imageMode(sketch.CENTER)
    sketch.reel = new ReelToReel(sketch, id, 135, 150)
    sketch.textFont(font)
    sketch.textSize(20)
    sketch.textAlign(sketch.CENTER, sketch.CENTER)
    postsetup(sketch)
  }

  sketch.draw = () => {
    sketch.clear()
    sketch.reel.show(sketch)
  }
}


reelPosToLineCoords = (position, r, d, length) => {
  const perimeter = 2*(d + Math.PI * r)
  let p = position * perimeter
  let x1, y1, x2, y2
  if (p < d) {
    // Section 1: Straight section on top
    x1 = x2 = p
    y1 = -r
    y2 = -r - length
  } else if (p < (d + Math.PI * r)) {
    // Section 2: Right semi-circle
    let t = (p - d)/r
    x1 = d + Math.cos(t-Math.PI/2) * r
    x2 = d + Math.cos(t-Math.PI/2) * (r + length)
    y1 = Math.sin(t-Math.PI/2) * r
    y2 = Math.sin(t-Math.PI/2) * (r + length)
  } else if (p < (2*d + Math.PI * r)) {
    // Section 3: Straight section on bottom
    let rem = p - d - Math.PI * r
    x1 = x2 = d - rem
    y1 = r
    y2 = r + length
  } else {
    // Section 4: Left semi-circle
    let t = (p - 2*d - Math.PI)/r
    x1 = Math.cos(t-Math.PI/2) * r
    x2 = Math.cos(t-Math.PI/2) * (r + length)
    y1 = Math.sin(t-Math.PI/2) * r
    y2 = Math.sin(t-Math.PI/2) * (r + length)
  }
  return [[x1, y1], [x2, y2]]
}


reelCoordsToPos = (x, y, r, d) => {
  const perimeter = 2*(d + Math.PI * r)
  if (x >= 0 && x <= d) {
    if (y <= 0) {
      // Section 1: Straight section on top
      return x / perimeter
    } else {
      // Section 3: Straight section on bottom
      return (d + Math.PI * r + (d - x)) / perimeter
    }
  }

  if (x < 0) {
    // Section 4: Left semi-circle
    let t = Math.atan2(y, x) + Math.PI/2
    if (t < 0) t += 2*Math.PI
    return (2*d + t * r) / perimeter
  } else {
    // Section 2: Right semi-circle
    let t = Math.atan2(y, x-d) + Math.PI/2
    if (t < 0) t += 2*Math.PI
    return (d + t * r) / perimeter
  }
}


class ReelToReel {
  constructor(sketch, id, x, y) {
    //location
    this.x = x;
    this.y = y;

    this.name = "test";

    this.input = sketch.createInput('test')
    this.input.parent(id)
    this.input.position(this.x - 76, this.y - 20)
    this.input.size(125, 30)
    this.input.class('tape-name')

    //add buttons and sliders
    this.playButton = new Button(play, playPressed, true, this.x + 36, this.y - 30);
    this.copyButton = new Button(copy, copyPressed, false, this.x + 67, this.y - 30);
    // TODO: eliminate value mapping duplication with phasing.js
    this.speedSlider = new Slider(this.x - 90, this.y + 40, 9/16, (x) => `${round2(x * 16 - 8)}x`);
    this.gainSlider = new Slider(this.x - 90, this.y + 80, 0.75, (x) => {
      let s = `${round2(72*(x - .75))} dB`
      return s[0] === '-' ? s : ('+' + s)
    });

    //rotation angle
    this.rot = 0;

    //variables for audio
    this.gain = 1;
    this.speed = 0;

    this.position = 0
  }

  show(sketch) {
    //draw body of reel to reel
    sketch.image(box, this.x, this.y);

    //draw tape
    sketch.image(tape, this.x, this.y - box.height/2 + 20);

    // draw position mark
    // const d = this.box.width - 70  // space between semi-circles
    const r = reel.height/2 - 1
    const d = Math.PI * r
    const length = 4
    const [[x1, y1], [x2, y2]] = reelPosToLineCoords(this.position, r, d, length)
    sketch.push()
    sketch.translate(this.x - box.width/2 + 35, this.y - box.height/2 + 20);
    sketch.stroke(255, 0, 0)
    sketch.strokeWeight(4)
    sketch.line(x1, y1, x2, y2)
    sketch.pop()

    //draw left reel
    let rot = (this.position*2*(Math.PI*r + d)/r) % (2*Math.PI)
    sketch.push();
    sketch.translate(this.x - box.width/2 + 35, this.y - box.height/2 + 20);
    sketch.rotate(rot);
    sketch.image(reel, 0, 0);
    sketch.pop();

    //draw right reel
    sketch.push();
    sketch.translate(this.x + box.width/2 - 35, this.y - box.height/2 + 20);
    sketch.rotate(rot);
    sketch.image(reel, 0, 0);
    sketch.pop();

    //draw play and copy button
    this.playButton.show(sketch);
    this.copyButton.show(sketch)

    sketch.textAlign(sketch.LEFT)
    sketch.fill(sketch.color(255, 255, 255))
    sketch.text("Speed", this.speedSlider.x, this.speedSlider.y - sketch.textAscent() - 3)
    sketch.text("Volume", this.gainSlider.x, this.gainSlider.y - sketch.textAscent() - 3)

    //draw sliders
    this.speedSlider.show(sketch);
    this.gainSlider.show(sketch);

    this.update(sketch);
  }

  update(sketch) {
    //update slider values
    // this.speed = this.speedSlider.value;
    // this.gain = this.gainSlider.value;
    //check play/pause button
    // if (this.playButton.toggle) {
    //   this.speed = 0;
    // }

    //rotate reels
    this.rot += sketch.map(this.speed, 0, 1, 0, 10);

    // const d = this.box.width - 70  // space between semi-circles
    const r = reel.height/2 - 1
    const d = Math.PI * r

    const x = sketch.mouseX - (this.x - box.width/2 - 35)
    const y = sketch.mouseY - (this.y - box.height/2 + 20)
    // if (sketch.mouseIsPressed)
    //   console.log(x, y, this.tape.width, this.tape.height)
    if (this.scrubbing && !sketch.mouseIsPressed) {
      this.scrubbing = false
    }

    const mouseOnReels = (x >= 0 && x <= tape.width + 30) && (y >= -tape.height/2 && y <= tape.height/2)

    if (!this.scrubbing && sketch.mouseIsPressed && mouseOnReels) {
      this.scrubbing = true
      this.scrubPos = reelCoordsToPos(x - (r + 22), y, r, d)
    } else if (this.scrubbing) {
      const newPos = reelCoordsToPos(x - (r + 22), y, r, d)
      if (this.onscrub) {
        this.onscrub(newPos - this.scrubPos)
      }
      this.scrubPos = newPos
    }

    if (this.scrubbing || mouseOnReels) {
      sketch.cursor('grab')
    } else {
      sketch.cursor(sketch.ARROW)
    }
  }
}

class Button {
  constructor(upImage, downImage, isToggle, x, y) {
    this.upImage = upImage
    this.downImage = downImage
    this.isToggle = isToggle
    this.x = x;
    this.y = y;
    this.pressed = false;
    this.toggle = false;
    this.registered = false;
    this.audio = document.getElementById("switch-audio")
  }

  show(sketch) {
    sketch.push();
    sketch.imageMode(sketch.CORNER);
    sketch.translate(this.x, this.y);
    const down = (this.isToggle && this.toggle) || this.pressed
    sketch.image(down ? this.downImage : this.upImage, 0, 0);
    sketch.pop();
    this.isPressed(sketch);
  }

  isPressed(sketch) {
    const mouseX = sketch.mouseX
    const mouseY = sketch.mouseY
    const mouseIsPressed = sketch.mouseIsPressed
    this.pressed = false;
    if (
      mouseX > this.x &&
      mouseX < this.x + this.upImage.width &&
      mouseY > this.y &&
      mouseY < this.y + this.upImage.height &&
      mouseIsPressed
    ) {
      this.pressed = true;
    }
    if (this.pressed && !this.registered){
      this.toggle = !this.toggle;
      this.registered = true;
      if (this.onclick) {
        this.onclick()
      }
      this.audio.currentTime = 0
      this.audio.play()
    }
    if (!this.pressed && this.registered){
      this.registered = false;
    }
  }
}

class Slider {
  constructor(x, y, initValue, toString) {
    this.x = x;
    this.y = y;
    this.value = initValue;
    this.toString = toString || (x => x)
    this.pressed = 0;
    this.sliderButton = sliderButton;
    this.registered = 0;
    this.width = 178
  }

  show(sketch) {
    this.isPressed(sketch);
    if (this.pressed) this.move(sketch);
    sketch.push();
    sketch.imageMode(sketch.CORNER);
    sketch.translate(this.x, this.y);
    sketch.fill(255)
    // image(sliderLine);
    sketch.rect(0, 0, this.width, 6);
    sketch.imageMode(sketch.CENTER);
    sketch.translate(this.width * this.value, 3);
    sketch.image(this.sliderButton, 0, 0);
    sketch.pop();
  }

  isPressed(sketch) {
    const mouseX = sketch.mouseX
    const mouseY = sketch.mouseY
    const mouseIsPressed = sketch.mouseIsPressed
    // this.pressed = 0;
    if (
      mouseX > this.x + this.width * this.value - sliderButton.width / 2 &&
      mouseX < this.x + this.width * this.value + sliderButton.width / 2 &&
      mouseY > this.y - sliderButton.height / 2 &&
      mouseY < this.y + sliderButton.height / 2 &&
      mouseIsPressed
      // pressed == 0
    ) {
      this.lastX = mouseX
      this.pressed = 1;
    } else if ((this.pressed == 1) & !mouseIsPressed) {
      this.pressed = 0;
    }

    if (this.pressed) {
      sketch.push()
      sketch.strokeWeight(2)
      sketch.fill(200, 200, 200, 230)
      let s = "" + this.toString(this.value)
      let textWidth = sketch.textWidth(s)
      let x = this.x + this.width * this.value - textWidth / 2
      let y = this.y - sliderButton.height - 18
      sketch.rectMode(sketch.CORNER)
      sketch.rect(x - 10, y, textWidth + 20, 28)
      sketch.fill(0, 0, 0, 230)
      sketch.textAlign(sketch.LEFT)
      sketch.text(s, x, y + 12)
      sketch.pop()
    }
  }

  move(sketch) {
    let oldValue = this.value
    if (sketch.keyIsDown(sketch.SHIFT)) {
      this.value += (sketch.mouseX - this.lastX) / this.width / 5;
    } else {
      this.value += (sketch.mouseX - this.lastX) / this.width;
    }
    if (this.value > 1) this.value = 1;
    else if (this.value < 0) this.value = 0;
    else this.lastX = sketch.mouseX
    if (this.onchange && this.value !== oldValue) {
      this.onchange(this.value)
    }
  }
}
