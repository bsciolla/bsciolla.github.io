const canvas = document.getElementById("canvas1");
const canvasdraw = canvas.getContext("2d");


let map = [];
let car = undefined;
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
    try{
        let point = map[i][j];
    }
    catch{ return; }
    if (map[i][j] !== undefined){
        let linked = relateElements(previousSelectedBlock, map[i][j]);
        if (!linked) {
            linked = relateToNearbyElement(i, j);    
        }
        if (!linked){
            selectElement(map[i][j]);
        }
    }
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

    block1.removed = true;
    block2.removed = true;
    block1.selected = null;
    block2.selected = null;
    previousSelectedBlock = null;
}

function turnCar(orientation) {
    car.angle += orientation * 0.1;
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
    constructor(x, y){
        this.x = 400;
        this.y = 400;
        this.vy = 1;
        this.vx = 0;
        this.speed = 2;
        this.angle = Math.PI/2.0;
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
        let transform = position(this.x, this.y);
        let transform2 = position(this.x + 15 * Math.cos(this.angle)
            , this.y + 15 * Math.sin(this.angle));
        let color = "rgba(120,40,155,255)";
        drawRectangle(color, transform, 30);
        drawRectangle(color, transform2, 25);
    }
}

class Block {
    constructor(x, y, radius){
        this.x = x;
        this.y = y;
        this.theta = 0;
        this.phi = 0;
        this.radius = radius;
        this.colormap = [
            "rgba(0,0,0,255)",
            "rgba(200,0,0,255)",
            "rgba(0,200,0,255)",
            "rgba(0,0,200,255)",
            "rgba(250,250,0,255)",
            "rgba(100,100,100,255)"];
        this.colorpairs = [
            [[155,  0,  0],[255,  0,  0]],
            [[155,103,  0],[255,170,  0]],
            [[ 13, 49, 132],[37, 94, 235]],
            [[  0,124,  0],[ 0,204,  0]],];
        this.allcolors = [
            [0,  0,  0],[255,  0,  0],
            [255,170,  0],
            [37, 94, 235],
            [ 0,204,  0],];
        /* this.allcolors = [
                [155,  0,  0],[255,  0,  0],
                [155,103,  0],[255,170,  0],
                [ 13, 49, 132],[37, 94, 235],
                [  0,124,  0],[ 0,204,  0],];*/
    }


    move(){
    }
    draw(){
        let transform = position(this.x, this.y);
        
        if (this.removed === true){
            return;
        }
        if (this.selected === selectionIndex){
            drawVoidRectangle("rgba(255,0,255,255)", transform, this.radius);
        }
        
        if (this.sort === -1){ return; }

        let step1color = this.coloring(this.sort, 5);
        let step2color = this.coloring(step1color.remains, 4);
        let step3color = this.coloring(step2color.remains, 5);

        let index1 = step1color.value;
        let index2 = step2color.value;
        let index3 = step3color.value;
        // let colorpair = this.allcolors[index1];

        let color1, color2;
        index2 = index2 < index1 ? index2 : index2 + 1;
        color1 = this.colorFromArray(this.allcolors[index1]);
        color2 = this.colorFromArray(this.allcolors[index2]);   

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
    }

    colorFromArray(colorarray){
        return "rgba(" + colorarray[0] +  "," + colorarray[1] + "," + + colorarray[2] + ")";
    }

    coloring(input, dividend){
        return {
            value: input % dividend,
            remains: Math.floor(input / dividend),
        };
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
    car = new Car();
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
        blocksToAttribute[0].sort = newSort;
        let rank = getRandomInt(0, blocksToAttribute.length - 1);
        blocksToAttribute[rank].sort = newSort;
        blocksToAttribute = blocksToAttribute.filter(b => b.sort === -1);
        goOn = blocksToAttribute.length >= 2;
    }
        

            
            
}


function animate(){
    requestAnimationFrame(animate);
    canvasdraw.fillStyle = "rgba(255, 255, 255, 0.75)";
    canvasdraw.fillRect(0, 0, canvas.width, canvas.height);
    for (var j = 0; j <= gridHeight; j++) {
        for (var i = 0; i <= gridWidth; i++) {
            map[j][i].move();
            map[j][i].draw();           
        }
    }
    car.move();
    car.draw();
}
init();
animate();

function reloadMap(){
    numberOfSorts = parseInt(document.getElementById("numberOfSortsInput").value);
    init();
}

window.addEventListener("resize", function(){
})
