const canvas = document.getElementById("canvas1");
const canvasdraw = canvas.getContext("2d");


let map = [];
let cars = [];
let effects = [];
let paused = false;
let targetFps = 60;
let frameInterval = 1000 / targetFps;
let lastFrameTime = 0;
let theta;
let score = 0;
let height = 20;
let gridSize = 50;
let blockSize = 40;
let originx = 0;
let originy = 0;
let previousSelectedBlock = null;
let selectionIndex = 0;
let numberOfSorts = 26;
let blockDamage = 20;
let animationDurationFactor = 100;

function scaledDuration(duration){
    return duration * animationDurationFactor / 100;
}
let hitAnimationDuration = 1.5;
let maxCars = 4;
let maxStars = 8;
let pendingCarSpawns = 0;
let starBlockCreationRange = 10;
let carEatDistance = 20;
let carDefaultSpeed = 2 * 0.75;
let carMinSpeed = 1 * 0.75;
let carMaxSpeed = 3 * 0.75;
let gridWidth = 18;
let gridHeight = 18;
let matchingDistance = Math.max(gridWidth, gridHeight);
let closeRange = 5;
let miniMargin = 0;
canvas.height = gridSize * gridHeight;
canvas.width = gridSize * gridWidth;
const mouse = {
    x: undefined,
    y: undefined
};

const camera = {
    x: 0,
    y: 0,
    theta: 0.,
}

function getRandomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max) + 1;
    return Math.floor(Math.random() * (max - min) + min);
}

/*window.addEventListener("mousemove", function(e){
    mouse.x = e.x;
    mouse.y = e.y;
});*/

window.addEventListener("mousedown", function(e){
    height = height * 1.2;
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    console.log("x: " + x + " y: " + y)
    blockClick(x, y);
});

function blockClick(x, y){
    let xi = Math.floor(x / gridSize);
    let yi = Math.floor(y / gridSize);
    tryFlipBlock(yi, xi);
}

function tryFlipBlock(i, j){
    let point;
    try{
        point = map[i][j];
    }
    catch{
        unselectBlock();
        return;
    }
    if (point === undefined || point.removed === true){
        unselectBlock();
        return;
    }
    let linked = relateElements(previousSelectedBlock, point);
    if (!linked) {
        linked = relateToNearbyElement(i, j);
    }
    if (!linked){
        selectElement(point);
    }
}

function unselectBlock(){
    if (previousSelectedBlock !== null){
        previousSelectedBlock.selected = null;
    }
    previousSelectedBlock = null;
}

function selectElement(block) {
    if (block.removed !== true){
        selectionIndex++;
        block.selected = selectionIndex;
        previousSelectedBlock = block;
    }
}

function relateToNearbyElement(iref, jref) {
    let clickedBlock = map[iref][jref];
    
    for (var i = Math.max(iref - closeRange, 0);
         i <= Math.min(iref + closeRange, gridHeight);
         i++){

        for (var j = Math.max(jref - closeRange, 0);
            j <= Math.min(jref + closeRange, gridWidth);
            j++){
     
            let targetBlock = map[i][j]; 
            if (targetBlock.removed !== true
                && clickedBlock.sort === targetBlock.sort){
                if (relateElements(clickedBlock, targetBlock)){
                    return true;
                }
            }
        }

    }

    return false;
}

function relateElements(block1, block2){
    if (block1 === null 
        || block2 === null
        || block1 === block2
        || block1.removed
        || block2.removed){
        return;
    }

    let possible1 = squareMatch(block1, block2);
    if (possible1){
        match(block1, block2, 2);
    } else {
        let possible =
            followALineMatchX(block1, block2, 1)
            || followALineMatchX(block1, block2, -1)
            || followALineMatchY(block1, block2, 1)
            || followALineMatchY(block1, block2, -1);
        if (possible){
            match(block1, block2, 3);
            return true;
        }
    }

    return false;
}


function followALineMatchX(block1, block2, factor){
    let possible = true;

    for (var i = 1; i <= gridWidth; i++) {
        let sourceBlock = null;
        try{
            sourceBlock = map[block1.i + i * factor][block1.j];
        }
        catch{ continue; }       
        if (sourceBlock === null
            || sourceBlock === undefined) {
            return false;
        }

        if (sourceBlock !== block1
            && sourceBlock !== block2
            && !sourceBlock.removed){
            return false;
        }
        possible = squareMatch(sourceBlock, block2);
        if (possible){
            return true;
        }
    }
}

function followALineMatchY(block1, block2, factor){
    let possible = true;

    for (var j = 1; j <= gridHeight; j++) {
        let sourceBlock = null;
        try{
            sourceBlock = map[block1.i][block1.j + j * factor];
        }
        catch{ continue; }       
        if (sourceBlock === null
            || sourceBlock === undefined) { 
            return false;
        }

        if (sourceBlock !== block1
            && sourceBlock !== block2
            && !sourceBlock.removed){
            return false;
        }
        possible = squareMatch(sourceBlock, block2);
        if (possible){
            return true;
        }
    }
}

function squareMatch(block1, block2) {
    if (block1 === null || block2 === null) { return false; }
    let imini = Math.min(block1.i, block2.i);
    let jmini = Math.min(block1.j, block2.j);

    let possible = false;
    if (block1.i === imini && block1.j === jmini
        || block2.i === imini && block2.j === jmini) {
        possible = oneWayDirectMatch(block1, block2);
    }
    else {
        possible = oneWayOtherMatch(block1, block2);
    }
    return possible;
}

function oneWayDirectMatch(block1, block2){
    let imini = Math.min(block1.i, block2.i);
    let deltai = Math.abs(block1.i - block2.i);
    let jmini = Math.min(block1.j, block2.j);
    let deltaj = Math.abs(block1.j - block2.j);
    
    let possible = 
        checkLineX(block1, block2, imini, deltai, jmini)
        && checkLineY(block1, block2, jmini, deltaj, imini + deltai);

    let possible2 = 
        checkLineX(block1, block2, imini, deltai, jmini + deltaj)
        && checkLineY(block1, block2, jmini, deltaj, imini); 
    return possible || possible2;
}

function oneWayOtherMatch(block1, block2){
    let imini = Math.min(block1.i, block2.i);
    let deltai = Math.abs(block1.i - block2.i);
    let jmini = Math.min(block1.j, block2.j);
    let deltaj = Math.abs(block1.j - block2.j);
    
    let possible = 
        checkLineX(block1, block2, imini, deltai, jmini + deltaj)
        && checkLineY(block1, block2, jmini, deltaj, imini + deltai);

    let possible2 = 
        checkLineX(block1, block2, imini, deltai, jmini)
        && checkLineY(block1, block2, jmini, deltaj, imini); 
    return possible || possible2;
}



function checkLineX(block1, block2, imini, deltai, j){
    possible = true;
    for (var i = 0; i <= deltai; i++) {
        let iblock = map[imini + i][j];
        if (iblock !== block1
         && iblock !== block2
         && !iblock.removed){
            possible = false;
        }
    }
    return possible;
}

function checkLineY(block1, block2, jmini, deltaj, i){
    possible = true;
    for (var j = 0; j <= deltaj; j++) {
        let iblock = map[i][jmini + j];
        if (iblock !== block1
         && iblock !== block2
         && !iblock.removed){
            possible = false;
        }
    }
    return possible;
}


function match(block1, block2, turns){
    if (block1.sort !== block2.sort)
    {
        return;
    }

    effects.push(new RingEffect(block1.x + block1.radius / 2, block1.y + block1.radius / 2, block1.color1));
    effects.push(new RingEffect(block2.x + block2.radius / 2, block2.y + block2.radius / 2, block2.color1));

    let newCars = [];
    let newStars = [];

    applyBlockRemovalDamage(block1, newCars, newStars);
    applyBlockRemovalDamage(block2, newCars, newStars);

    applyStarDamage(block1, newStars);
    applyStarDamage(block2, newStars);

    applyStarMovement(block1, newStars);
    applyStarMovement(block2, newStars);

    block1.removed = true;
    block2.removed = true;
    block1.selected = null;
    block2.selected = null;
    previousSelectedBlock = null;
}

function computeHitDamage(distance, minDistance, maxDistance){
    let maxDamage = blockDamage;

    if (distance <= minDistance) { return maxDamage; }
    if (distance >= maxDistance) { return 0; }
    return maxDamage * (maxDistance - distance) / (maxDistance - minDistance);
}

function blockHitDamage(distance){
    return computeHitDamage(distance, 2 * gridSize, 6 * gridSize);
}

function starHitDamage(distance){
    return computeHitDamage(distance, 1.5 * gridSize, 4.5 * gridSize);
}

function applyBlockRemovalDamage(block, newCars, newStars){
    let centerX = block.x + block.radius / 2;
    let centerY = block.y + block.radius / 2;

    let deadCars = [];
    for (var c of cars){
        if (newCars.includes(c)) { continue; }

        let dx = c.x - centerX;
        let dy = c.y - centerY;
        let distance = Math.sqrt(dx * dx + dy * dy);
        let damage = blockHitDamage(distance);
        if (damage > 0){
            c.loseHealth(damage);
            if (c.health <= 0){
                deadCars.push(c);
            } else {
                c.onHit();
            }
        }
    }
    for (var dead of deadCars){
        respawnCar(dead, newCars, newStars);
    }
}

function applyStarDamage(block, newStars){
    let centerX = block.x + block.radius / 2;
    let centerY = block.y + block.radius / 2;

    for (var e of effects){
        if (!(e instanceof Star)) { continue; }
        if (newStars.includes(e)) { continue; }

        let dx = e.x - centerX;
        let dy = e.y - centerY;
        let distance = Math.sqrt(dx * dx + dy * dy);
        let damage = starHitDamage(distance);
        if (damage > 0){
            e.loseHealth(damage);
            if (e.health < 50){
                e.regen();
            }
        }
    }
}

function spawnMissRate(candidate){
    let neighbors = [
        { i: candidate.i - 1, j: candidate.j },
        { i: candidate.i + 1, j: candidate.j },
        { i: candidate.i, j: candidate.j - 1 },
        { i: candidate.i, j: candidate.j + 1 },
    ];

    let fullCount = 0;
    for (var n of neighbors){
        let neighborBlock = null;
        if (n.i >= 0 && n.i <= gridHeight && n.j >= 0 && n.j <= gridWidth){
            neighborBlock = map[n.i][n.j];
        }
        let isFull = neighborBlock === null || neighborBlock === undefined || neighborBlock.removed !== true;
        if (isFull){
            fullCount++;
        }
    }

    return fullCount / 4;
}

function spawnNearbyBlock(x, y, rangeInGrid){
    let range = rangeInGrid * gridSize;
    let candidates = [];

    for (var j = 0; j <= gridHeight; j++) {
        for (var i = 0; i <= gridWidth; i++) {
            let candidate = map[j][i];
            if (!candidate.removed) { continue; }

            let centerX = candidate.x + candidate.radius / 2;
            let centerY = candidate.y + candidate.radius / 2;
            let dx = centerX - x;
            let dy = centerY - y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < range){
                candidates.push(candidate);
            }
        }
    }

    if (candidates.length === 0) { return; }

    let chosen = candidates[getRandomInt(0, candidates.length - 1)];

    if (Math.random() < spawnMissRate(chosen)) { return; }

    chosen.setSort(getRandomInt(0, numberOfSorts - 1));
    chosen.removed = false;

    gsap.killTweensOf(chosen, "spawnScale,spawnAngle,spawnAlpha");
    chosen.spawnScale = 0;
    chosen.spawnAngle = 2 * Math.PI;
    chosen.spawnAlpha = 0;
    gsap.to(chosen, { spawnScale: 1, duration: scaledDuration(0.8), ease: "power3.out" });
    gsap.to(chosen, { spawnAngle: 0, duration: scaledDuration(0.8), ease: "power3.out" });
    gsap.to(chosen, { spawnAlpha: 1, duration: scaledDuration(0.8), ease: "power3.out" });
}

function applyStarMovement(block, newStars){
    let centerX = block.x + block.radius / 2;
    let centerY = block.y + block.radius / 2;
    let range = 5 * gridSize;

    for (var e of effects){
        if (!(e instanceof Star)) { continue; }
        if (newStars.includes(e)) { continue; }

        let dx = centerX - e.x;
        let dy = centerY - e.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance >= range) { continue; }

        let angle = Math.atan2(dy, dx);
        let amount = getRandomFloat(gridSize, gridSize * 3);
        let targetX = e.x + amount * Math.cos(angle);
        let targetY = e.y + amount * Math.sin(angle);
        gsap.killTweensOf(e, "x,y");
        gsap.to(e, { x: targetX, y: targetY, duration: scaledDuration(hitAnimationDuration), ease: "power2.out" });
    }
}

function randomCarColor(){
    let r = getRandomInt(60, 255);
    let g = getRandomInt(60, 255);
    let b = getRandomInt(60, 255);
    return "rgba(" + r + "," + g + "," + b + ",255)";
}

function canSpawnStarAt(x, y){
    let minDistance = starBlockCreationRange * gridSize;
    for (var e of effects){
        if (!(e instanceof Star)) { continue; }

        let dx = e.x - x;
        let dy = e.y - y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance){
            return false;
        }
    }
    return true;
}

function respawnCar(deadCar, newCars, newStars){
    let index = cars.indexOf(deadCar);
    if (index === -1) { return; }
    cars.splice(index, 1);

    let starCount = effects.filter(e => e instanceof Star).length;
    if (starCount < maxStars && canSpawnStarAt(deadCar.x, deadCar.y)){
        let star = new Star(deadCar.x, deadCar.y);
        effects.push(star);
        newStars.push(star);
    }

    let desiredSpawns = 2 + pendingCarSpawns;
    let availableSlots = Math.max(1, maxCars - cars.length);
    let actualSpawns = Math.min(desiredSpawns, availableSlots);
    pendingCarSpawns = desiredSpawns - actualSpawns;

    for (var k = 0; k < actualSpawns; k++){
        let shiftAngle = Math.random() * Math.PI * 2;
        let newX = deadCar.x + gridSize * Math.cos(shiftAngle);
        let newY = deadCar.y + gridSize * Math.sin(shiftAngle);
        let newCar = new Car(newX, newY, randomCarColor());
        newCar.speed = getRandomFloat(carMinSpeed, carMaxSpeed);
        newCar.angle = Math.random() * Math.PI * 2;
        cars.push(newCar);
        newCars.push(newCar);
    }
}

function rgbaWithAlpha(colorString, alpha){
    let match = /rgba?\(([^)]+)\)/.exec(colorString);
    if (!match) { return "rgba(0,0,0," + alpha + ")"; }
    let parts = match[1].split(",").map(s => s.trim());
    return "rgba(" + parts[0] + "," + parts[1] + "," + parts[2] + "," + alpha + ")";
}

function blendColor(baseColorString, targetRgb, factor){
    let match = /rgba?\(([^)]+)\)/.exec(baseColorString);
    let base = match
        ? match[1].split(",").map(s => parseFloat(s.trim()))
        : [0, 0, 0];

    let r = Math.round(base[0] + (targetRgb[0] - base[0]) * factor);
    let g = Math.round(base[1] + (targetRgb[1] - base[1]) * factor);
    let b = Math.round(base[2] + (targetRgb[2] - base[2]) * factor);
    return "rgba(" + r + "," + g + "," + b + ",255)";
}

class RingEffect {
    constructor(x, y, color){
        this.x = x;
        this.y = y;
        this.color = color;
        this.done = false;
        this.progress = { t: 0 };
        gsap.to(this.progress, {
            t: 1,
            duration: scaledDuration(0.6),
            ease: "power2.out",
            onComplete: () => { this.done = true; },
        });
    }
    draw(){
        this.drawRing(0, 40, 10.5);
        this.drawRing(0.15, 55, 7.5);
    }
    drawRing(delay, maxRadius, maxLineWidth){
        let localT = (this.progress.t - delay) / (1 - delay);
        if (localT <= 0) { return; }
        localT = Math.min(1, localT);

        let transform = position(this.x, this.y);
        canvasdraw.beginPath();
        canvasdraw.arc(transform.x, transform.y, localT * maxRadius, 0, Math.PI * 2);
        canvasdraw.lineWidth = maxLineWidth * (1 - localT * 0.5);
        canvasdraw.strokeStyle = rgbaWithAlpha(this.color, 1 - localT);
        canvasdraw.stroke();
    }
}

class Star {
    constructor(x, y, color){
        this.x = x;
        this.y = y;
        this.color = color || "rgba(255,215,0,255)";
        this.done = false;
        this.health = 100;
        this.lowHealthColor = [255, 69, 0];
    }
    loseHealth(amount){
        this.health = Math.max(0, this.health - amount);
    }
    get sizeMultiplier(){
        return 2 - this.health / 100;
    }
    regen(){
        this.health = Math.min(100, this.health + 20);
        spawnNearbyBlock(this.x, this.y, starBlockCreationRange);
    }
    draw(){
        let transform = position(this.x, this.y);
        let size = 18 * this.sizeMultiplier;

        let lowHealthFactor = (100 - this.health) / 100;
        let displayColor = blendColor(this.color, this.lowHealthColor, lowHealthFactor);

        canvasdraw.save();
        canvasdraw.translate(transform.x, transform.y);
        canvasdraw.scale(1, 1.6);
        canvasdraw.rotate(Math.PI / 4);
        canvasdraw.fillStyle = displayColor;
        canvasdraw.fillRect(-size / 2, -size / 2, size, size);
        canvasdraw.restore();
    }
}

function turnCar(orientation) {
    cars[0].angle += orientation * 0.1;
}

function position(x, y) {
    let transform = {
            x: (x - camera.x),
            y: (y - camera.y),
        };
        transform.x = Math.cos(camera.theta) * transform.x 
            + Math.sin(camera.theta) * transform.y;
        transform.y = Math.cos(camera.theta) * transform.y 
            - Math.sin(camera.theta) * transform.x;
    return transform;
}

window.onkeydown = function (event) {
      switch (event.keyCode) {
         case 37:
            turnCar(-1.0);
            break;
         case 38:
            originy = originy - 1;
            break;
         case 39:
            turnCar(1.0);
            break;
         case 40:
            originy = originy + 1;
            break;
      }
   };

class Car {
    constructor(x, y, color){
        this.x = x;
        this.y = y;
        this.vy = 1;
        this.vx = 0;
        this.speed = carDefaultSpeed;
        this.angle = Math.PI/2.0;
        this.color = color;
        this.health = 100;
        this.bounceScale = 1;
        this.colorShift = 0;
        this.nurtureColor = [255, 205, 80];
    }
    loseHealth(amount){
        this.health = Math.max(0, this.health - amount);
    }
    get sizeMultiplier(){
        return 2 - this.health / 100;
    }
    onHit(){
        gsap.killTweensOf(this, "bounceScale");
        this.bounceScale = 1.4;
        gsap.to(this, { bounceScale: 1, duration: scaledDuration(hitAnimationDuration), ease: "elastic.out(1, 0.4)" });

        gsap.killTweensOf(this, "colorShift");
        this.colorShift = 1;
        gsap.to(this, { colorShift: 0, duration: scaledDuration(1.2), ease: "power2.out" });
    }
    move(){
        this.angle = this.angle + (Math.random() - 0.5) * 0.1;
        this.vx = this.speed * Math.cos(this.angle);
        this.vy = this.speed * Math.sin(this.angle);
        this.x += this.vx;
        this.y += this.vy;
        if (this.x > canvas.width){
            this.x = 0;
        } else if (this.x < 0){
            this.x = canvas.width;
        }
        if (this.y > canvas.height){
            this.y = 0;
        } else if (this.y < 0){
            this.y = canvas.height;
        }
    }
    draw(){
        let scale = this.sizeMultiplier * this.bounceScale;
        let bodySize = 21 * scale;
        let headSize = 17.5;
        let centerDistance = 15;

        let bodyCenterX = this.x + bodySize / 2;
        let bodyCenterY = this.y + bodySize / 2;
        let headCenterX = bodyCenterX + centerDistance * Math.cos(this.angle);
        let headCenterY = bodyCenterY + centerDistance * Math.sin(this.angle);

        let transform = position(bodyCenterX - bodySize / 2, bodyCenterY - bodySize / 2);
        let transform2 = position(headCenterX - headSize / 2, headCenterY - headSize / 2);

        let bodyColor = this.colorShift > 0
            ? blendColor(this.color, this.nurtureColor, this.colorShift)
            : this.color;
        drawRectangle(bodyColor, transform, bodySize);
        drawRectangle("rgba(0,0,0,255)", transform2, headSize);
    }
}

let colorAssociations = [[]];

let allColorStrings = 
    ["B", "R", "O", "U", "G"];
let allColorsRgb = [
    [0, 0, 0],
    [255, 0, 0],
    [255, 170, 0],
    [37, 94, 255],
    [0, 204, 0],];

function stringToColor(color){
    let index = allColorStrings.indexOf(color);
    if (index >= 0){
        return colorFromArray(allColorsRgb[index]);
    }

    return null;
}

function colorFromArray(colorarray){
    return "rgba(" + colorarray[0] +  "," + colorarray[1] + "," + + colorarray[2] + ")";
}

function coloring(input, dividend){
    return {
        value: input % dividend,
        remains: Math.floor(input / dividend),
    };
}

class Block {
    constructor(x, y, radius){
        this.x = x;
        this.y = y;
        this.theta = 0;
        this.phi = 0;
        this.radius = radius;
        this.spawnScale = 1;
        this.spawnAngle = 0;
        this.spawnAlpha = 1;
    }
    move(){
    }
    setSort(sort){
        this.sort = sort;
        if (this.sort === -1){ return; }

        let step1color = coloring(this.sort, 5);
        let step2color = coloring(step1color.remains, 4);
        let step3color = coloring(step2color.remains, 5);

        let index1 = step1color.value;
        let index2 = step2color.value;
        let index3 = step3color.value;
        // let colorpair = this.allcolors[index1];
        this.drawingType = index3;
        index2 = index2 < index1 ? index2 : index2 + 1;
        this.color1 = stringToColor(allColorStrings[index1]);
        this.color2 = stringToColor(allColorStrings[index2]);           
    }
    draw(){
        if (this.removed === true){
            return;
        }

        let centerX = this.x + this.radius / 2;
        let centerY = this.y + this.radius / 2;
        let center = position(centerX, centerY);

        canvasdraw.save();
        canvasdraw.translate(center.x, center.y);
        canvasdraw.rotate(this.spawnAngle);
        canvasdraw.scale(this.spawnScale, this.spawnScale);
        canvasdraw.translate(-center.x, -center.y);
        canvasdraw.globalAlpha = this.spawnAlpha;

        let transform = position(this.x, this.y);
        if (this.selected === selectionIndex){
            drawVoidRectangle("rgba(255,0,255,255)", transform, this.radius);
        }

        let color1 = this.color1;
        let color2 = this.color2;
        let index3 = this.drawingType;
        if (index3 === 0) {
            let innertransform1 = position(this.x, this.y);
            drawRectangle(color1, innertransform1, this.radius);
            let innertransform = position(this.x + this.radius/4, this.y + this.radius/4);
            drawRectangle(color2, innertransform, this.radius/2);
        }
        if (index3 === 1) {
            let innertransform1 = position(this.x, this.y);
            let innertransform2 = position(this.x + miniMargin * this.radius, this.y + 0.6 * this.radius);
            drawRectangle(color2, innertransform1, this.radius, this.radius);
            drawRectangle(color1, innertransform2, this.radius * (1 - 2 * miniMargin), 0.25 * this.radius);
        }
        if (index3 === 2) {
            let innertransform1 = position(this.x, this.y);
            let innertransform2 = position(this.x +  0.6 * this.radius, this.y);
            drawRectangle(color2, innertransform1, this.radius, this.radius);
            drawRectangle(color1, innertransform2, 0.25 * this.radius, this.radius);
        }
        if (index3 === 3) {
            drawRectangle(color2, transform, this.radius);
            let innertransform = position(this.x + this.radius/4, this.y + this.radius/4);
            drawRectangle(color1, innertransform, this.radius/2);
        }

        canvasdraw.restore();
    }
}



function drawVoidRectangle(color, transform, radius){
    canvasdraw.strokeStyle = color;
    canvasdraw.lineWidth = 2;
    canvasdraw.strokeRect(transform.x, transform.y, radius, radius);
}

function drawRectangle(color, transform, radius, radius2){
    canvasdraw.fillStyle = color;
    if (radius2 === undefined) { radius2 = radius ;}
    canvasdraw.fillRect(transform.x, transform.y, radius, radius2);
}



function init(){
    console.log(Math.cos(360));
    cars = [
        new Car(300, 300, "rgba(120,40,155,255)"),
        new Car(500, 500, "rgba(255,140,0,255)"),
    ];
    effects = [];
    let blocksToAttribute = [];
    for (var j = 0; j <= gridHeight; j++) {
        let row = [];
        for (var i = 0; i <= gridWidth; i++) {
            let block = {
                i: j,
                j: i,
                x: i * gridSize + 10,
                y: j * gridSize + 10,
                radius: blockSize,
            };
            let createdBlock = new Block(block.x, block.y, block.radius);
            // don't worry about i<>j here
            createdBlock.i = j;
            createdBlock.j = i;
            createdBlock.sort = -1;
            blocksToAttribute.push(createdBlock);
            row[i] = createdBlock;
        }
        map[j] = row;
    }
    let goOn = true;
    while(goOn)
    {
        let newSort = getRandomInt(0, numberOfSorts - 1);
        blocksToAttribute[0].setSort(newSort);
        let rank = getRandomInt(0, blocksToAttribute.length - 1);
        blocksToAttribute[rank].setSort(newSort);
        blocksToAttribute = blocksToAttribute.filter(b => b.sort === -1);
        goOn = blocksToAttribute.length >= 2;
    }
        

            
            
}


function handleCarEatingStars(){
    for (var c of cars){
        for (var e of effects){
            if (!(e instanceof Star) || e.done) { continue; }

            let dx = c.x - e.x;
            let dy = c.y - e.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < carEatDistance){
                e.done = true;
            }
        }
    }
}

function animate(timestamp){
    if (paused){ return; }
    requestAnimationFrame(animate);

    timestamp = timestamp || 0;
    let elapsed = timestamp - lastFrameTime;
    if (elapsed < frameInterval){
        return;
    }
    lastFrameTime = timestamp - (elapsed % frameInterval);

    canvasdraw.fillStyle = "rgba(255, 255, 255, 0.75)";
    canvasdraw.fillRect(0, 0, canvas.width, canvas.height);

    handleCarEatingStars();
    for (var e of effects){
        if (e.done || !(e instanceof Star)) { continue; }
        e.draw();
    }

    for (var j = 0; j <= gridHeight; j++) {
        for (var i = 0; i <= gridWidth; i++) {
            map[j][i].move();
            map[j][i].draw();
        }
    }
    for (var c of cars){
        c.move();
        c.draw();
    }
    for (var e of effects){
        if (e.done || e instanceof Star) { continue; }
        e.draw();
    }
    effects = effects.filter(e => !e.done);
}
init();
animate();

function reloadMap(){
    numberOfSorts = parseInt(document.getElementById("numberOfSortsInput").value);
    init();
}

function updateBlockDamage(){
    blockDamage = parseFloat(document.getElementById("blockDamageInput").value);
}
updateBlockDamage();

function updateAnimationDurationFactor(){
    animationDurationFactor = parseFloat(document.getElementById("animationDurationFactorInput").value);
}
updateAnimationDurationFactor();

function togglePause(){
    paused = !paused;
    document.getElementById("pauseButton").textContent = paused ? "Resume" : "Pause";
    if (paused){
        gsap.globalTimeline.pause();
    } else {
        gsap.globalTimeline.resume();
        animate();
    }
}

window.addEventListener("resize", function(){
})
