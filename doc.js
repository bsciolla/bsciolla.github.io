const canvas = document.getElementById("canvas1");
const canvasdraw = canvas.getContext("2d");


let map = [];
let cars = [];
let effects = [];
let trunks = [];
let branches = [];
let trunkLinks = [];
let paused = false;
let targetFps = 60;
let frameInterval = 1000 / targetFps;

// Random block shine: board-wide, independent of damage/match animations. We want a mean time of
// blockShineMeanIntervalSeconds between shine events across the WHOLE board. Modeling shines as a
// Poisson process, mean interval = half life / ln(2) (same relationship as radioactive decay: half
// life is the time by which there's a 50% chance an event has already happened). So:
//   half life = mean interval * ln(2)
// Each block then independently rolls a per-frame chance so their combined (summed) rate matches
// this board-wide rate — see maybeTriggerRandomShines.
let blockShineMeanIntervalSeconds = 5;
let blockShineHalfLifeSeconds = blockShineMeanIntervalSeconds * Math.LN2;
let lastFrameTime = 0;
let theta;
let score = 0;
let height = 20;
let gridSize = 50;
let blockSize = 40;
let blockCornerRadiusFactor = 0.18;
let blockShapeCount = 7;
let originx = 0;
let originy = 0;
let previousSelectedBlock = null;
let selectionIndex = 0;
let numberOfSorts = 16;
let blockDamage = 40;
let animationDurationFactor = 100;

function scaledDuration(duration){
    return duration * animationDurationFactor / 100;
}
let hitAnimationDuration = 1.5;
let maxCars = 8;
let maxStars = 8;
let pendingCarSpawns = 0;
let starBlockCreationRange = 10;
let carEatDistance = 20;
let carDefaultSpeed = 2 * 0.75;
let carMinSpeed = 1 * 0.75;
let carMaxSpeed = 3 * 0.75;
let tokenSpawnChance = 0.05;
let tokenLifespanRemovals = 4;
let tokenTypes = ["damageUp", "damageDown", "starEatToggle"];
let damageTokenCounter = 0;
let starsEatable = false;
let maxCarSpawnedTrunks = 1;
let carSpawnedTrunkCount = 0;
let activeTokenBlocks = [];
let randomMode = false;
let randomModeStuck = false;
let gridWidth = 18;
let gridHeight = 18;
let matchingDistance = Math.max(gridWidth, gridHeight);
let closeRange = 5;
let miniMargin = 0;
// Grid indices run 0..gridWidth inclusive, with each block offset by 10px; keep a matching 10px margin at the far edge.
canvas.height = gridSize * (gridHeight + 1) + 10;
canvas.width = gridSize * (gridWidth + 1) + 10;

// Settled branches never change, so they are drawn once into this layer; trunks are redrawn into theirs only when marked dirty.
const branchLayer = document.createElement("canvas");
branchLayer.width = canvas.width;
branchLayer.height = canvas.height;
const branchLayerDraw = branchLayer.getContext("2d");
const trunkLayer = document.createElement("canvas");
trunkLayer.width = canvas.width;
trunkLayer.height = canvas.height;
const trunkLayerDraw = trunkLayer.getContext("2d");
let trunkLayerDirty = true;
let branchLayerDirty = false;

// Drawn once at startup from the same tree-polygon shapes, then reused unchanged every frame.
const backgroundLayer = document.createElement("canvas");
backgroundLayer.width = canvas.width;
backgroundLayer.height = canvas.height;
const backgroundLayerDraw = backgroundLayer.getContext("2d");
generateBackgroundLayer();
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

function wrapPosition(entity){
    if (entity.x > canvas.width){
        entity.x = 0;
    } else if (entity.x < 0){
        entity.x = canvas.width;
    }
    if (entity.y > canvas.height){
        entity.y = 0;
    } else if (entity.y < 0){
        entity.y = canvas.height;
    }
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

    triggerToken(point);

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
        playAwaitingMatchPulse(block);
    }
}

function playAwaitingMatchPulse(block){
    gsap.killTweensOf(block, "spawnScale");
    block.spawnScale = 1;
    gsap.to(block, {
        spawnScale: 1.25,
        duration: scaledDuration(0.15),
        ease: "power2.out",
        yoyo: true,
        repeat: 1,
    });
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
        return match(block1, block2, 2);
    } else {
        let possible =
            followALineMatchX(block1, block2, 1)
            || followALineMatchX(block1, block2, -1)
            || followALineMatchY(block1, block2, 1)
            || followALineMatchY(block1, block2, -1);
        if (possible){
            return match(block1, block2, 3);
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
            && !sourceBlock.removed
            && !sourceBlock.token){
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
            && !sourceBlock.removed
            && !sourceBlock.token){
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
         && !iblock.removed
         && !iblock.token){
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
         && !iblock.removed
         && !iblock.token){
            possible = false;
        }
    }
    return possible;
}


function tokenCoreColor(token){
    if (token.key === "damageUp") { return currentTheme.tokenDamageUp; }
    if (token.key === "damageDown") { return currentTheme.tokenDamageDown; }
    if (token.key === "starEatToggle") {
        return starsEatable ? currentTheme.tokenToggleOn : currentTheme.tokenToggleOff;
    }
    return currentTheme.tokenDefault;
}

function removeTokenFromActiveList(block){
    let index = activeTokenBlocks.indexOf(block);
    if (index !== -1){
        activeTokenBlocks.splice(index, 1);
    }
}

function triggerToken(block){
    if (!block.token) { return; }

    let token = block.token;
    let color = tokenCoreColor(token);
    effects.push(new SquareRingEffect(block.x + block.radius / 2, block.y + block.radius / 2, color));

    if (token.key === "damageUp"){
        damageTokenCounter += 1;
    } else if (token.key === "damageDown"){
        damageTokenCounter -= 1;
    } else if (token.key === "starEatToggle"){
        starsEatable = !starsEatable;
    }

    block.token = null;
    block.removed = true;
    removeTokenFromActiveList(block);
}

function advanceTokenLifespans(excluding){
    for (var b of activeTokenBlocks.slice()){
        if (excluding.includes(b)) { continue; }

        b.token.removalsLeft -= 2;
        if (b.token.removalsLeft <= 0){
            b.token = null;
            b.removed = true;
            removeTokenFromActiveList(b);
        }
    }
}

function spawnTokenAt(block){
    block.removed = false;
    block.sort = -1;

    let key = tokenTypes[getRandomInt(0, tokenTypes.length - 1)];
    block.token = { key: key, removalsLeft: tokenLifespanRemovals };
    activeTokenBlocks.push(block);

    playBlockSpawnAnimation(block);
}

function maybeSpawnTokenFromRemoval(block1, block2){
    if (!currentScenario.tokensEnabled) { return; }
    if (Math.random() >= tokenSpawnChance) { return; }

    let target = Math.random() < 0.5 ? block1 : block2;
    spawnTokenAt(target);
}

function toggleRandomMode(){
    randomMode = !randomMode;
    document.getElementById("randomModeButton").textContent = "Random Mode: " + (randomMode ? "On" : "Off");
}

function isAcceptablePair(block1, block2){
    if (block1 === null || block2 === null || block1 === block2) { return false; }
    if (block1.removed || block2.removed) { return false; }
    if (block1.token || block2.token) { return false; }
    if (block1.sort === -1 || block1.sort !== block2.sort) { return false; }

    if (squareMatch(block1, block2)) { return true; }

    return followALineMatchX(block1, block2, 1)
        || followALineMatchX(block1, block2, -1)
        || followALineMatchY(block1, block2, 1)
        || followALineMatchY(block1, block2, -1);
}

function findRandomAcceptablePair(){
    let candidates = [];
    for (var j = 0; j <= gridHeight; j++){
        for (var i = 0; i <= gridWidth; i++){
            let block = map[j][i];
            if (!block.removed && !block.token){
                candidates.push(block);
            }
        }
    }
    if (candidates.length < 2) { return null; }

    let acceptablePairs = [];
    for (let a = 0; a < candidates.length; a++){
        for (let b = a + 1; b < candidates.length; b++){
            if (isAcceptablePair(candidates[a], candidates[b])){
                acceptablePairs.push([candidates[a], candidates[b]]);
            }
        }
    }
    if (acceptablePairs.length === 0) { return null; }

    return acceptablePairs[getRandomInt(0, acceptablePairs.length - 1)];
}

function hasPendingAnimation(){
    for (var e of effects){
        if (e instanceof Star) { continue; }
        if (!e.done) { return true; }
    }
    return false;
}

function performRandomMove(){
    let pair = findRandomAcceptablePair();
    if (!pair) {
        randomModeStuck = true;
        return;
    }

    tryFlipBlock(pair[0].i, pair[0].j);
    if (pair[0].removed || pair[1].removed) { return; }
    tryFlipBlock(pair[1].i, pair[1].j);
}

function triggerCarMovementBurst(){
    for (var c of cars){
        c.turnCount += 1;
        gsap.killTweensOf(c, "speedFactor");
        c.speedFactor = 1;
        gsap.to(c, { speedFactor: 0, duration: scaledDuration(3), ease: "power2.out" });
    }
}

function match(block1, block2, turns){
    if (block1.sort !== block2.sort)
    {
        return false;
    }

    randomModeStuck = false;

    effects.push(new RingEffect(block1.x + block1.radius / 2, block1.y + block1.radius / 2, block1.color1));
    effects.push(new RingEffect(block2.x + block2.radius / 2, block2.y + block2.radius / 2, block2.color1));

    let newCars = [];
    let newStars = [];
    let newTrunks = [];

    applyBlockRemovalDamage(block1, newCars, newStars, newTrunks);
    applyBlockRemovalDamage(block2, newCars, newStars, newTrunks);

    applyStarDamage(block1, newStars);
    applyStarDamage(block2, newStars);

    applyStarMovement(block1, newStars);
    applyStarMovement(block2, newStars);

    applyTrunkDamage(block1, newTrunks);
    applyTrunkDamage(block2, newTrunks);

    triggerCarMovementBurst();

    triggerToken(block1);
    triggerToken(block2);
    advanceTokenLifespans([block1, block2]);

    block1.removed = true;
    block2.removed = true;
    block1.selected = null;
    block2.selected = null;
    unselectBlock();

    blocksRemovedCount += 2;
    checkScenarioCompletion();

    maybeSpawnTokenFromRemoval(block1, block2);

    propagateTrunkJuice();
    return true;
}

function effectiveBlockDamage(){
    return blockDamage * Math.pow(1.2, damageTokenCounter);
}

function computeHitDamage(distance, minDistance, maxDistance){
    let maxDamage = effectiveBlockDamage();

    if (distance <= minDistance) { return maxDamage; }
    if (distance >= maxDistance) { return 0; }
    return maxDamage * (maxDistance - distance) / (maxDistance - minDistance);
}

function blockHitDamage(distance){
    return computeHitDamage(distance, 2 * gridSize, 6 * gridSize);
}

function starHitDamage(distance){
    return computeHitDamage(distance, 2 * gridSize, 6 * gridSize);
}

function trunkHitDamage(distance){
    return computeHitDamage(distance, 2 * gridSize, 6 * gridSize);
}

function applyBlockRemovalDamage(block, newCars, newStars, newTrunks){
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
        respawnCar(dead, newCars, newStars, newTrunks);
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
            for (let regenCount = 0; regenCount < 4 && e.health < 50; regenCount++){
                e.regen();
            }
        }
    }
}

function applyTrunkDamage(block, newTrunks){
    let centerX = block.x + block.radius / 2;
    let centerY = block.y + block.radius / 2;

    let closest = null;
    let closestDistance = Infinity;
    for (var e of trunks){
        if (newTrunks.includes(e)) { continue; }

        let dx = e.x - centerX;
        let dy = e.y - centerY;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < closestDistance){
            closestDistance = distance;
            closest = e;
        }
    }

    if (closest === null) { return; }

    let damage = trunkHitDamage(closestDistance);
    if (damage > 0){
        closest.loseHealth(damage);
        closest.gainJuice(damage * trunkJuiceGainFactor);

        if (Math.random() < trunkJuiceRandomBonusChance){
            let luckyTrunk = trunks[getRandomInt(0, trunks.length - 1)];
            luckyTrunk.gainJuice(trunkJuiceRandomBonusAmount);
        }
    }
}

function propagateTrunkJuice(){
    let degree = new Map();
    for (var link of trunkLinks){
        degree.set(link.a, (degree.get(link.a) || 0) + 1);
        degree.set(link.b, (degree.get(link.b) || 0) + 1);
    }

    // Metropolis weights keep this stable regardless of link count: juice equalizes toward
    // the shared average across each trunk<->trunk link, rather than each trunk hoarding its own.
    let deltas = new Map();
    for (var link of trunkLinks){
        let weight = trunkLinkDiffusionRate / (1 + Math.max(degree.get(link.a), degree.get(link.b)));
        let target = (link.a.juice + link.b.juice) / 2;
        deltas.set(link.a, (deltas.get(link.a) || 0) + weight * (target - link.a.juice));
        deltas.set(link.b, (deltas.get(link.b) || 0) + weight * (target - link.b.juice));
    }
    for (var [trunk, delta] of deltas){
        if (delta > 0){
            trunk.gainJuice(delta);
        } else {
            trunk.juice = Math.max(0, trunk.juice + delta);
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
                candidates.push({ block: candidate, distance: distance });
            }
        }
    }

    // Closest empty cells are tried first; a farther one is only reached once every closer
    // candidate has either failed its miss roll or turned out not to be empty in the first place.
    candidates.sort((a, b) => a.distance - b.distance);

    for (var candidate of candidates){
        let chosen = candidate.block;
        if (Math.random() < spawnMissRate(chosen)) { continue; }

        chosen.setSort(getRandomInt(0, numberOfSorts - 1));
        chosen.removed = false;
        randomModeStuck = false;

        playBlockSpawnAnimation(chosen);
        return;
    }
}

function playBlockSpawnAnimation(block){
    gsap.killTweensOf(block, "spawnScale,spawnAngle,spawnAlpha");
    block.spawnScale = 0;
    block.spawnAngle = 2 * Math.PI;
    block.spawnAlpha = 0;
    gsap.to(block, { spawnScale: 1, duration: scaledDuration(0.8), ease: "power3.out" });
    gsap.to(block, { spawnAngle: 0, duration: scaledDuration(0.8), ease: "power3.out" });
    gsap.to(block, { spawnAlpha: 1, duration: scaledDuration(0.8), ease: "power3.out" });
}

function findClosestOtherStar(star){
    let closest = null;
    let closestDistance = Infinity;

    for (var other of effects){
        if (other === star || !(other instanceof Star)) { continue; }

        let dx = other.x - star.x;
        let dy = other.y - star.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < closestDistance){
            closestDistance = distance;
            closest = other;
        }
    }

    return { star: closest, distance: closestDistance };
}

let closestTrunkSearchRange = 5 * blockSize;

function nearbyTrunksTo(x, y, exclude){
    // Every one of pickAvoidingAngle's candidates must be scored against ALL trunks in range,
    // not just a top-N closest-to-parent shortlist: a trunk that isn't among the parent's own
    // nearest neighbors can still be the closest thing to one specific candidate direction, and
    // ignoring it lets that candidate land on (or right next to) an existing trunk unnoticed.
    let maxDistanceSquared = closestTrunkSearchRange * closestTrunkSearchRange;
    return trunks.filter(t => {
        if (t === exclude) { return false; }
        let dx = t.x - x;
        let dy = t.y - y;
        return dx * dx + dy * dy <= maxDistanceSquared;
    });
}

let angleNoiseFactor = 0.25;
let trunkHealthInjectionFactor = 1.0;
let trunkOvershootBlockRange = 3;
let trunkLinkDiffusionRate = 1.0;
let trunkJuiceGainFactor = 1.5;
let trunkJuiceThreshold = 100;
let trunkJuiceRandomBonusChance = 0.1;
let trunkJuiceRandomBonusAmount = 45;
let trunkMinGrowthClearanceFactor = 0.5;

function pickAvoidingAngle(x, y, distance, neighbors, fallbackAngle){
    if (neighbors.length === 0){
        return fallbackAngle;
    }

    let noiseAmount = distance * angleNoiseFactor;
    let sampleCount = 30;
    let bestAngle = fallbackAngle;
    let bestScore = -Infinity;
    for (let i = 0; i < sampleCount; i++){
        let theta = i * (2 * Math.PI / sampleCount);
        let candidateX = x + distance * Math.cos(theta);
        let candidateY = y + distance * Math.sin(theta);

        let minDistance = Infinity;
        for (var neighbor of neighbors){
            let dx = candidateX - neighbor.x;
            let dy = candidateY - neighbor.y;
            let neighborDistance = Math.sqrt(dx * dx + dy * dy);
            if (neighborDistance < minDistance){
                minDistance = neighborDistance;
            }
        }

        let noisyScore = minDistance + getRandomFloat(-noiseAmount, noiseAmount);
        if (noisyScore > bestScore){
            bestScore = noisyScore;
            bestAngle = theta;
        }
    }

    if (bestScore < distance * trunkMinGrowthClearanceFactor){
        return null;
    }

    return bestAngle;
}

function applyStarMovement(block, newStars){
    let centerX = block.x + block.radius / 2;
    let centerY = block.y + block.radius / 2;
    let range = 5 * gridSize;
    let crowdRange = 2 * gridSize;

    for (var e of effects){
        if (!(e instanceof Star)) { continue; }
        if (newStars.includes(e)) { continue; }

        let dx = centerX - e.x;
        let dy = centerY - e.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance >= range) { continue; }

        let closest = findClosestOtherStar(e);
        let angle;
        if (closest.star !== null && closest.distance < crowdRange){
            angle = Math.atan2(e.y - closest.star.y, e.x - closest.star.x);
        } else {
            angle = Math.atan2(dy, dx);
        }

        let amount = getRandomFloat(gridSize, gridSize * 3);
        let targetX = e.x + amount * Math.cos(angle);
        let targetY = e.y + amount * Math.sin(angle);
        gsap.killTweensOf(e, "x,y");
        let star = e;
        gsap.to(e, {
            x: targetX,
            y: targetY,
            duration: scaledDuration(hitAnimationDuration),
            ease: "power2.out",
            onUpdate: () => wrapPosition(star),
        });
    }
}

function randomCarColor(){
    let carColors = currentTheme.carColors;
    if (carColors === null){
        let r = getRandomInt(60, 255);
        let g = getRandomInt(60, 255);
        let b = getRandomInt(60, 255);
        return "rgba(" + r + "," + g + "," + b + ",255)";
    }
    return carColors[getRandomInt(0, carColors.length - 1)];
}

function respawnCar(deadCar, newCars, newStars, newTrunks){
    let index = cars.indexOf(deadCar);
    if (index === -1) { return; }
    cars.splice(index, 1);

    if (currentScenario.starsEnabled){
        let starCount = effects.filter(e => e instanceof Star).length;
        if (starCount < maxStars){
            let star = new Star(deadCar.x, deadCar.y);
            effects.push(star);
            newStars.push(star);
        }
    } else if (carSpawnedTrunkCount < maxCarSpawnedTrunks){
        let trunk = new Trunk(deadCar.x, deadCar.y);
        trunks.push(trunk);
        newTrunks.push(trunk);
        carSpawnedTrunkCount++;
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

class SquareRingEffect {
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
        this.drawSquare(0, 40, 10.5);
        this.drawSquare(0.15, 55, 7.5);
    }
    drawSquare(delay, maxRadius, maxLineWidth){
        let localT = (this.progress.t - delay) / (1 - delay);
        if (localT <= 0) { return; }
        localT = Math.min(1, localT);

        let transform = position(this.x, this.y);
        let size = localT * maxRadius * 2;
        canvasdraw.lineWidth = maxLineWidth * (1 - localT * 0.5);
        canvasdraw.strokeStyle = rgbaWithAlpha(this.color, 1 - localT);
        canvasdraw.strokeRect(transform.x - size / 2, transform.y - size / 2, size, size);
    }
}

class Star {
    constructor(x, y, color){
        this.x = x;
        this.y = y;
        this.color = color || currentTheme.star;
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
        this.health = Math.min(100, this.health + 15);
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

function generateIrregularRectPolygon(width, height, jitterFactor){
    let halfW = width / 2;
    let halfH = height / 2;
    let pointsPerSide = 3;
    let jitter = width * jitterFactor;
    let corners = [
        { x: -halfW, y: -halfH },
        { x: halfW, y: -halfH },
        { x: halfW, y: halfH },
        { x: -halfW, y: halfH },
    ];

    let points = [];
    for (let side = 0; side < corners.length; side++){
        let start = corners[side];
        let end = corners[(side + 1) % corners.length];
        for (let p = 0; p < pointsPerSide; p++){
            let t = p / pointsPerSide;
            let baseX = start.x + (end.x - start.x) * t;
            let baseY = start.y + (end.y - start.y) * t;
            points.push({
                x: baseX + getRandomFloat(-jitter, jitter),
                y: baseY + getRandomFloat(-jitter, jitter),
            });
        }
    }
    return points;
}

function drawIrregularPolygon(ctx, x, y, angle, scale, polygon, color){
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++){
        ctx.lineTo(polygon[i].x, polygon[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function rebuildTrunkLayer(){
    trunkLayerDraw.clearRect(0, 0, trunkLayer.width, trunkLayer.height);
    for (var t of trunks){
        if (t.settled){ t.draw(trunkLayerDraw); }
    }
    trunkLayerDirty = false;
}

function rebuildBranchLayer(){
    branchLayerDraw.clearRect(0, 0, branchLayer.width, branchLayer.height);
    for (var b of branches){
        if (b.settled){ b.draw(branchLayerDraw); }
    }
    branchLayerDirty = false;
}

function generateBackgroundLayer(){
    let shapeCount = 120;
    for (let i = 0; i < shapeCount; i++){
        let width = getRandomFloat(60, 160);
        let height = getRandomFloat(80, 220);
        let polygon = generateIrregularRectPolygon(width, height, 0.18);
        let x = getRandomFloat(0, backgroundLayer.width);
        let y = getRandomFloat(0, backgroundLayer.height);
        let angle = Math.random() * Math.PI * 2;
        let shade = getRandomInt(200, 235);
        let alpha = getRandomFloat(0.15, 0.35);
        let color = "rgba(" + shade + "," + shade + "," + shade + "," + alpha + ")";
        drawIrregularPolygon(backgroundLayerDraw, x, y, angle, 1, polygon, color);
    }
}

function trunkBaseColor(){
    return blendColor(currentTheme.trunkBase, [255, 255, 255], 0.5);
}

function darkenedTrunkColor(darken){
    return blendColor(trunkBaseColor(), [0, 0, 0], darken);
}

class Branch {
    constructor(x, y, angle, spawnDelay, parentTrunk, childTrunk){
        this.x = x;
        this.y = y;
        this.done = false;
        this.darken = getRandomFloat(0, 0.5);
        this.angle = angle;
        this.width = 22;
        this.height = 32;
        this.polygon = generateIrregularRectPolygon(this.width, this.height, 0.18);
        this.parentTrunk = parentTrunk || null;
        this.childTrunk = childTrunk || null;

        this.scale = 0;
        this.settled = false;
        gsap.to(this, {
            scale: 1,
            duration: scaledDuration(0.5),
            delay: scaledDuration(spawnDelay || 0),
            ease: "back.out(2)",
            onComplete: () => {
                this.settled = true;
                branchLayerDirty = true;
            },
        });
    }
    get color(){
        return darkenedTrunkColor(this.darken);
    }
    draw(ctx){
        let transform = position(this.x, this.y);
        drawIrregularPolygon(ctx, transform.x, transform.y, this.angle, this.scale, this.polygon, this.color);
    }
}

class Trunk {
    constructor(x, y, spawnDelay){
        this.x = x;
        this.y = y;
        this.done = false;
        this.darken = getRandomFloat(0, 0.5);
        this.lowHealthColor = [70, 45, 30];
        this.health = 100;
        this.angle = Math.random() * Math.PI * 2;
        this.width = 22;
        this.height = 32;
        this.polygon = generateIrregularRectPolygon(this.width, this.height, 0.18);
        this.spawnedTrunk = null;
        this.juice = 0;

        this.spawnScale = 0;
        this.settled = false;
        gsap.to(this, {
            spawnScale: 1,
            duration: scaledDuration(0.5),
            delay: scaledDuration(spawnDelay || 0),
            ease: "back.out(2)",
            onComplete: () => {
                this.settled = true;
                trunkLayerDirty = true;
            },
        });
    }
    loseHealth(amount){
        let wasAlive = this.health > 0;
        this.health = Math.max(0, this.health - amount);
        if (wasAlive && this.health <= 0){
            this.spawnAdjacentTrunk();
        }
        this.injectHealthToNeighbors(amount);
    }
    injectHealthToNeighbors(damageAmount){
        if (this.spawnedTrunk === null) { return; }
        this.spawnedTrunk.gainHealth(damageAmount * trunkHealthInjectionFactor);
    }
    gainJuice(amount){
        if (amount <= 0) { return; }
        this.juice += amount;

        while (this.juice >= trunkJuiceThreshold){
            this.juice -= trunkJuiceThreshold;
            spawnNearbyBlock(this.x, this.y, trunkOvershootBlockRange);
        }
    }
    gainHealth(amount){
        let wasUnderCap = this.health <= 100;
        this.health += amount;
        if (wasUnderCap && this.health > 100){
            this.health = 100;
            spawnNearbyBlock(this.x, this.y, trunkOvershootBlockRange);
        }
    }
    get color(){
        return darkenedTrunkColor(this.darken);
    }
    get sizeMultiplier(){
        return Math.max(0.3, 2 - this.health / 100);
    }
    regen(){
        this.spawnAdjacentTrunk();
    }
    spawnAdjacentTrunk(){
        let distance = 1.5 * blockSize;
        let branchCount = 3;
        let branchStagger = 0.3;

        let neighbors = nearbyTrunksTo(this.x, this.y, this);
        let angle = pickAvoidingAngle(this.x, this.y, distance, neighbors, Math.random() * Math.PI * 2);
        if (angle === null){
            this.health = 100;
            return;
        }

        let child = new Trunk(
            this.x + distance * Math.cos(angle),
            this.y + distance * Math.sin(angle),
            branchCount * branchStagger
        );
        trunks.push(child);
        trunkLinks.push({ a: this, b: child });
        this.spawnedTrunk = child;

        for (let i = 1; i <= branchCount; i++){
            let t = i / (branchCount + 1);
            let branchX = this.x + (child.x - this.x) * t;
            let branchY = this.y + (child.y - this.y) * t;

            branches.push(new Branch(branchX, branchY, angle, (i - 1) * branchStagger, this, child));
        }

        this.health = 100;
    }
    draw(ctx){
        let transform = position(this.x, this.y);
        let lowHealthFactor = (100 - this.health) / 100;
        let displayColor = blendColor(this.color, this.lowHealthColor, lowHealthFactor);
        drawIrregularPolygon(ctx, transform.x, transform.y, this.angle, this.sizeMultiplier * this.spawnScale, this.polygon, displayColor);
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
        this.speedFactor = 0;
        this.turnCount = 0;
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
        if (this.speedFactor > 0){
            this.angle = this.angle + (Math.random() - 0.5) * 0.1;
        }
        this.vx = this.speed * Math.cos(this.angle) * this.speedFactor;
        this.vy = this.speed * Math.sin(this.angle) * this.speedFactor;
        this.x += this.vx;
        this.y += this.vy;
        wrapPosition(this);
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

        canvasdraw.save();
        canvasdraw.globalAlpha = 0.6;
        drawRectangle(bodyColor, transform, bodySize);
        drawRectangle(currentTheme.carHead, transform2, headSize);
        canvasdraw.restore();
    }
}

let colorAssociations = [[]];

let themes = {
    classic: {
        label: "Classic",
        blockColors: [[0, 0, 0], [255, 0, 0], [255, 170, 0], [37, 94, 255], [0, 204, 0]],
        legacyShapeEncoding: true,
        blockOutline: null,
        selection: "rgba(255,0,255,255)",
        tokenDamageUp: "rgba(220,40,40,255)",
        tokenDamageDown: "rgba(40,100,220,255)",
        tokenToggleOn: "rgba(255,255,255,255)",
        tokenToggleOff: "rgba(0,0,0,255)",
        tokenDefault: "rgba(255,255,255,255)",
        checkerA: "rgba(255,215,0,255)",
        checkerB: "rgba(255,140,0,255)",
        star: "rgba(255,215,0,255)",
        carColors: null,
        carHead: "rgba(0,0,0,255)",
        trunkBase: "rgba(128,0,0,255)",
    },
    muted: {
        label: "Muted",
        blockColors: [[44, 56, 62], [220, 118, 48], [244, 232, 204], [28, 110, 116]],
        legacyShapeEncoding: false,
        blockOutline: "rgba(44,56,62,255)",
        blockOutlineWidth: 1.5,
        selection: "rgba(255,190,80,255)",
        tokenDamageUp: "rgba(212,120,60,255)",
        tokenDamageDown: "rgba(52,160,164,255)",
        tokenToggleOn: "rgba(224,208,184,255)",
        tokenToggleOff: "rgba(44,56,62,255)",
        tokenDefault: "rgba(224,208,184,255)",
        checkerA: "rgba(224,208,184,255)",
        checkerB: "rgba(212,120,60,255)",
        star: "rgba(255,190,80,255)",
        carColors: ["rgba(220,118,48,255)", "rgba(28,110,116,255)", "rgba(44,56,62,255)", "rgba(244,232,204,255)"],
        carHead: "rgba(44,56,62,255)",
        trunkBase: "rgba(120,80,60,255)",
    },
    colorful: {
        label: "Colorful",
        // Yellow at index 4 is not pure yellow: it's blended 10% toward this theme's orange (index 2).
        blockColors: [[44, 56, 62], [255, 0, 0], [255, 170, 0], [10, 40, 170], [255, 247, 0]],
        // Every block pairs one bright color with a shaded twin of itself, never two brights
        // (no red with blue). Red and yellow shade toward black; blue shades toward cream/white
        // instead — targets aligned by position with brightColorIndices (red, blue, yellow).
        brightColorIndices: [1, 3, 4],
        brightNeutralTargets: [[0, 0, 0], [255, 255, 255], [0, 0, 0]],
        // Blue leans much harder toward its target than the shared neutralShadeFactor (red/yellow
        // toward black) so it reads as near-white, not just a pale blue.
        brightNeutralFactors: [0.92, 0.98, 0.92],
        neutralShadeFactor: 0.92,
        legacyShapeEncoding: false,
        blockOutline: null,
        selection: "rgba(255,0,255,255)",
        tokenDamageUp: "rgba(220,40,40,255)",
        tokenDamageDown: "rgba(40,100,220,255)",
        tokenToggleOn: "rgba(220,218,212,255)",
        tokenToggleOff: "rgba(44,56,62,255)",
        tokenDefault: "rgba(220,218,212,255)",
        checkerA: "rgba(220,218,212,255)",
        checkerB: "rgba(255,170,0,255)",
        star: "rgba(255,215,0,255)",
        carColors: ["rgba(255,0,0,255)", "rgba(255,170,0,255)", "rgba(10,40,170,255)", "rgba(255,247,0,255)", "rgba(44,56,62,255)"],
        carHead: "rgba(44,56,62,255)",
        trunkBase: "rgba(120,80,60,255)",
    },
    colorlight: {
        label: "Colorlight",
        // Same structure as Colorful (bright + shaded-twin pairing), with lighter, softer hues:
        // red pushed whiter and toward purple/pink, blue pushed lighter and toward turquoise, and
        // orange standing in for green as the third bright.
        blockColors: [[44, 56, 62], [245, 45, 75], [255, 165, 30], [35, 183, 178]],
        neutralColorIndices: [0],
        brightColorIndices: [1, 2, 3],
        legacyShapeEncoding: false,
        blockOutline: "rgba(44,56,62,255)",
        blockOutlineWidth: 0.25,
        selection: "rgba(255,0,255,255)",
        tokenDamageUp: "rgba(220,50,80,255)",
        tokenDamageDown: "rgba(35,155,155,255)",
        tokenToggleOn: "rgba(220,218,212,255)",
        tokenToggleOff: "rgba(44,56,62,255)",
        tokenDefault: "rgba(220,218,212,255)",
        checkerA: "rgba(220,218,212,255)",
        checkerB: "rgba(255,165,30,255)",
        star: "rgba(255,215,0,255)",
        carColors: ["rgba(245,45,75,255)", "rgba(255,165,30,255)", "rgba(35,183,178,255)", "rgba(44,56,62,255)"],
        carHead: "rgba(44,56,62,255)",
        trunkBase: "rgba(120,80,60,255)",
    },
};
let themeOrder = [themes.classic, themes.muted, themes.colorful, themes.colorlight];
let currentTheme = themes.colorlight;

function blendRgb(baseRgb, targetRgb, factor){
    return [
        Math.round(baseRgb[0] + (targetRgb[0] - baseRgb[0]) * factor),
        Math.round(baseRgb[1] + (targetRgb[1] - baseRgb[1]) * factor),
        Math.round(baseRgb[2] + (targetRgb[2] - baseRgb[2]) * factor),
    ];
}

let defaultNeutralShadeFactor = 0.85;

function themeColorPairs(theme){
    if (theme.colorPairs) { return theme.colorPairs; }

    let pairs = [];
    let shadeFactor = theme.neutralShadeFactor !== undefined ? theme.neutralShadeFactor : defaultNeutralShadeFactor;
    if (theme.brightNeutralTargets){
        // Each bright gets its own blend target (e.g. black for one color, cream/white for
        // another) instead of every bright sharing the same neutral. Aligned by position with
        // brightColorIndices. Computed once here and appended to blockColors, so every later
        // lookup (setSort, etc.) just reuses the cached entry.
        for (let idx = 0; idx < theme.brightColorIndices.length; idx++){
            let bright = theme.brightColorIndices[idx];
            let brightRgb = theme.blockColors[bright];
            let targetRgb = theme.brightNeutralTargets[idx];
            let targetFactor = theme.brightNeutralFactors ? theme.brightNeutralFactors[idx] : shadeFactor;
            let shadedRgb = blendRgb(brightRgb, targetRgb, targetFactor);
            let shadedIndex = theme.blockColors.push(shadedRgb) - 1;

            pairs.push([bright, shadedIndex]);
            pairs.push([shadedIndex, bright]);
        }
    } else if (theme.brightColorIndices){
        // Each bright is paired with a shaded twin of itself (blended toward each neutral), not
        // with the neutral's own raw color. Computed once here and appended to blockColors, so
        // every later lookup (setSort, etc.) just reuses the cached entry.
        for (var bright of theme.brightColorIndices){
            let brightRgb = theme.blockColors[bright];
            for (var neutral of theme.neutralColorIndices){
                let neutralRgb = theme.blockColors[neutral];
                let shadedRgb = blendRgb(brightRgb, neutralRgb, shadeFactor);
                let shadedIndex = theme.blockColors.push(shadedRgb) - 1;

                pairs.push([bright, shadedIndex]);
                pairs.push([shadedIndex, bright]);
            }
        }
    } else {
        // Every ordered pair of distinct colors, color1 varying fastest.
        let colorCount = theme.blockColors.length;
        for (let second = 0; second < colorCount - 1; second++){
            for (let first = 0; first < colorCount; first++){
                pairs.push([first, second < first ? second : second + 1]);
            }
        }
    }
    theme.colorPairs = pairs;
    return pairs;
}

function applyTheme(theme){
    currentTheme = theme;

    for (var row of map){
        for (var block of row){
            if (block.sort !== -1){ block.setSort(block.sort); }
        }
    }
    for (var c of cars){
        c.color = randomCarColor();
    }
    for (var e of effects){
        if (e instanceof Star){ e.color = theme.star; }
    }
    trunkLayerDirty = true;
    branchLayerDirty = true;

    let themeButton = document.getElementById("themeButton");
    if (themeButton){
        themeButton.textContent = "Theme: " + theme.label;
    }
}

function toggleTheme(){
    let next = (themeOrder.indexOf(currentTheme) + 1) % themeOrder.length;
    applyTheme(themeOrder[next]);
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

function triggerBlockShine(block){
    block.shineActive = true;
    block.shineT = 0;
    gsap.to(block, {
        shineT: 1,
        duration: scaledDuration(0.8),
        ease: "power1.inOut",
        onComplete: () => { block.shineActive = false; },
    });
}

function maybeTriggerRandomShines(dtSeconds){
    // Each block independently rolls this frame's chance; summed across all of them, the board-wide
    // rate works out to ln(2) / blockShineHalfLifeSeconds, i.e. one shine every blockShineMeanIntervalSeconds on average.
    let totalBlocks = (gridWidth + 1) * (gridHeight + 1);
    let boardRatePerSecond = Math.LN2 / blockShineHalfLifeSeconds;
    let perBlockProbability = (boardRatePerSecond * dtSeconds) / totalBlocks;

    for (var j = 0; j <= gridHeight; j++){
        for (var i = 0; i <= gridWidth; i++){
            let block = map[j][i];
            if (block.removed || block.token || block.shineActive) { continue; }
            if (Math.random() < perBlockProbability){
                triggerBlockShine(block);
            }
        }
    }
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
        this.token = null;
        this.shineActive = false;
        this.shineT = 0;
    }
    move(){
    }
    setSort(sort){
        this.sort = sort;
        if (this.sort === -1){ return; }

        if (currentTheme.legacyShapeEncoding){
            // The exact original color1 -> color2 -> shape formula and dividends (5, 4, 5), kept
            // as a selectable option: at the default sort count this always lands on shape 0, just
            // like before this file ever had a Muted theme or extra shapes.
            let step1color = coloring(this.sort, 5);
            let step2color = coloring(step1color.remains, 4);
            let step3color = coloring(step2color.remains, 5);

            let index1 = step1color.value;
            let index2 = step2color.value;
            index2 = index2 < index1 ? index2 : index2 + 1;

            this.drawingType = step3color.value;
            this.color1 = colorFromArray(currentTheme.blockColors[index1]);
            this.color2 = colorFromArray(currentTheme.blockColors[index2]);
            return;
        }

        // Distinct combos = (allowed color pairs) * blockShapeCount: Muted 12 * 7 = 84, Colorful 16 * 7 = 112.
        // The color pair varies fastest, so low sort counts use every color with the first shape only,
        // and further shapes (in order) appear only once the sort count exceeds the number of pairs.
        let pairs = themeColorPairs(currentTheme);

        let pairStep = coloring(this.sort, pairs.length);
        let shapeStep = coloring(pairStep.remains, blockShapeCount);
        let pair = pairs[pairStep.value];

        this.drawingType = shapeStep.value;
        this.color1 = colorFromArray(currentTheme.blockColors[pair[0]]);
        this.color2 = colorFromArray(currentTheme.blockColors[pair[1]]);
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
        let cornerRadius = this.radius * blockCornerRadiusFactor;

        if (this.token){
            let swapped = Math.floor(performance.now() / 500) % 2 === 1;
            drawCheckerboard(transform, this.radius, this.radius * 0.3, swapped);
            let coreTransform = position(this.x + this.radius / 4, this.y + this.radius / 4);
            drawRectangle(tokenCoreColor(this.token), coreTransform, this.radius / 2);
            canvasdraw.restore();
            return;
        }

        let color1 = this.color1;
        let color2 = this.color2;
        let index3 = this.drawingType;

        canvasdraw.save();
        traceRoundedRectPath(transform.x, transform.y, this.radius, cornerRadius);
        canvasdraw.clip();

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
            // A ring/target pattern, not just case 0 with color1 and color2 swapped: swapping colors
            // on this shape can't reproduce (or be reproduced by) any other shape here, unlike the old
            // case 3, which was pixel-identical to case 0 with color1 and color2 traded — two different
            // sorts could render as the same block, making them unmatchable but visually identical.
            drawRectangle(color2, transform, this.radius);
            let ringInset = this.radius * 0.22;
            let ringTransform = position(this.x + ringInset, this.y + ringInset);
            drawRectangle(color1, ringTransform, this.radius - ringInset * 2);
            let coreInset = this.radius * 0.4;
            let coreTransform = position(this.x + coreInset, this.y + coreInset);
            drawRectangle(color2, coreTransform, this.radius - coreInset * 2);
        }
        if (index3 === 4) {
            drawRectangle(color2, transform, this.radius);
            let dotCenter = position(this.x + this.radius / 2, this.y + this.radius / 2);
            canvasdraw.beginPath();
            canvasdraw.arc(dotCenter.x, dotCenter.y, this.radius * 0.18, 0, Math.PI * 2);
            canvasdraw.fillStyle = color1;
            canvasdraw.fill();
        }
        if (index3 === 5) {
            drawRectangle(color2, transform, this.radius);
            let dotCenter = position(this.x + this.radius / 2, this.y + this.radius / 2);
            canvasdraw.beginPath();
            canvasdraw.arc(dotCenter.x, dotCenter.y, this.radius * 0.4, 0, Math.PI * 2);
            canvasdraw.fillStyle = color1;
            canvasdraw.fill();
        }
        if (index3 === 6) {
            drawRectangle(color2, transform, this.radius);
            let barThickness = this.radius * 0.28;
            let hBarTransform = position(this.x, this.y + (this.radius - barThickness) / 2);
            drawRectangle(color1, hBarTransform, this.radius, barThickness);
            let vBarTransform = position(this.x + (this.radius - barThickness) / 2, this.y);
            drawRectangle(color1, vBarTransform, barThickness, this.radius);
        }

        if (this.shineActive){
            // A diagonal highlight band sweeping across the block, confined to the same clip as the
            // shape above. Alpha follows sin(sweep * pi): zero at both ends, peak at the midpoint.
            let sweep = this.shineT;
            let alpha = Math.sin(sweep * Math.PI) * 0.5;
            let bandWidth = this.radius * 0.35;
            let travel = -bandWidth + sweep * (this.radius * 2 + bandWidth * 2);

            canvasdraw.save();
            canvasdraw.translate(transform.x + this.radius / 2, transform.y + this.radius / 2);
            canvasdraw.rotate(Math.PI / 4);
            canvasdraw.fillStyle = "rgba(255,255,255," + alpha + ")";
            canvasdraw.fillRect(travel - this.radius, -this.radius, bandWidth, this.radius * 2);
            canvasdraw.restore();
        }

        canvasdraw.restore();

        if (currentTheme.blockOutline !== null){
            traceRoundedRectPath(transform.x, transform.y, this.radius, cornerRadius);
            canvasdraw.strokeStyle = currentTheme.blockOutline;
            canvasdraw.lineWidth = currentTheme.blockOutlineWidth;
            canvasdraw.stroke();
        }

        if (this.selected === selectionIndex){
            drawVoidRoundedRectangle(currentTheme.selection, transform, this.radius, cornerRadius);
        }

        canvasdraw.restore();
    }
}



function drawVoidRoundedRectangle(color, transform, size, cornerRadius){
    traceRoundedRectPath(transform.x, transform.y, size, cornerRadius);
    canvasdraw.strokeStyle = color;
    canvasdraw.lineWidth = 4;
    canvasdraw.stroke();
}

function drawRectangle(color, transform, radius, radius2){
    canvasdraw.fillStyle = color;
    if (radius2 === undefined) { radius2 = radius ;}
    canvasdraw.fillRect(transform.x, transform.y, radius, radius2);
}

function traceRoundedRectPath(x, y, size, r){
    canvasdraw.beginPath();
    canvasdraw.moveTo(x + r, y);
    canvasdraw.lineTo(x + size - r, y);
    canvasdraw.arcTo(x + size, y, x + size, y + r, r);
    canvasdraw.lineTo(x + size, y + size - r);
    canvasdraw.arcTo(x + size, y + size, x + size - r, y + size, r);
    canvasdraw.lineTo(x + r, y + size);
    canvasdraw.arcTo(x, y + size, x, y + size - r, r);
    canvasdraw.lineTo(x, y + r);
    canvasdraw.arcTo(x, y, x + r, y, r);
    canvasdraw.closePath();
}

function drawRoundedRect(color, transform, size, cornerRadius){
    traceRoundedRectPath(transform.x, transform.y, size, cornerRadius);
    canvasdraw.fillStyle = color;
    canvasdraw.fill();
}

function drawCheckerboard(transform, size, cornerRadius, swapped){
    let x = transform.x;
    let y = transform.y;
    let cellCount = 4;
    let cellSize = size / cellCount;
    let colorA = currentTheme.checkerA;
    let colorB = currentTheme.checkerB;

    canvasdraw.save();
    traceRoundedRectPath(x, y, size, cornerRadius);
    canvasdraw.clip();

    for (let row = 0; row < cellCount; row++){
        for (let col = 0; col < cellCount; col++){
            let isEven = (row + col) % 2 === 0;
            let useColorA = swapped ? !isEven : isEven;
            canvasdraw.fillStyle = useColorA ? colorA : colorB;
            canvasdraw.fillRect(x + col * cellSize, y + row * cellSize, cellSize, cellSize);
        }
    }

    canvasdraw.restore();
}



function randomConformation(blocksToAttribute){
    while (blocksToAttribute.length >= 2){
        let newSort = getRandomInt(0, numberOfSorts - 1);
        blocksToAttribute[0].setSort(newSort);
        let rank = getRandomInt(1, blocksToAttribute.length - 1);
        blocksToAttribute[rank].setSort(newSort);
        blocksToAttribute = blocksToAttribute.filter(b => b.sort === -1);
    }
    // An unpaired leftover would otherwise stay unremoved with no sort: invisible, yet blocking paths.
    for (var leftover of blocksToAttribute){
        leftover.removed = true;
    }
}

let scenarios = {
    random: {
        name: "random",
        completionBlockCount: (gridWidth + 1) * (gridHeight + 1),
        initialCarCount: 2,
        starsEnabled: true,
        tokensEnabled: true,
        setup: randomConformation,
    },
    tutorial: {
        name: "tutorial",
        completionBlockCount: 10,
        initialCarCount: 0,
        starsEnabled: true,
        tokensEnabled: false,
        setup: randomConformation,
    },
    tree: {
        name: "tree",
        completionBlockCount: (gridWidth + 1) * (gridHeight + 1),
        initialCarCount: 2,
        starsEnabled: false,
        tokensEnabled: true,
        eatableByDefault: true,
        setup: randomConformation,
    },
};

let currentScenario = scenarios.tree;
let blocksRemovedCount = 0;
let scenarioCompleted = false;

let scenarioSelect = document.getElementById("scenarioSelect");
if (scenarioSelect){
    for (var scenarioKey in scenarios){
        let option = document.createElement("option");
        option.value = scenarioKey;
        option.textContent = scenarios[scenarioKey].name;
        scenarioSelect.appendChild(option);
        if (scenarios[scenarioKey] === currentScenario){
            scenarioSelect.value = scenarioKey;
        }
    }
}

function updateScenario(){
    let select = document.getElementById("scenarioSelect");
    currentScenario = scenarios[select.value];
    init();
}

function checkScenarioCompletion(){
    if (scenarioCompleted) { return; }
    if (blocksRemovedCount < currentScenario.completionBlockCount) { return; }

    scenarioCompleted = true;
    let congratsElement = document.getElementById("congratsMessage");
    if (congratsElement){
        congratsElement.textContent = "Congratulations!";
        congratsElement.style.display = "block";
    }
}

function init(){
    console.log(Math.cos(360));
    cars = [];
    for (var k = 0; k < currentScenario.initialCarCount; k++){
        let x = getRandomFloat(0, canvas.width);
        let y = getRandomFloat(0, canvas.height);
        cars.push(new Car(x, y, randomCarColor()));
    }
    effects = [];
    for (var oldTrunk of trunks){ gsap.killTweensOf(oldTrunk); }
    for (var oldBranch of branches){ gsap.killTweensOf(oldBranch); }
    trunks = [];
    branches = [];
    trunkLinks = [];
    branchLayerDraw.clearRect(0, 0, branchLayer.width, branchLayer.height);
    trunkLayerDirty = true;
    activeTokenBlocks = [];
    damageTokenCounter = 0;
    starsEatable = !!currentScenario.eatableByDefault;
    carSpawnedTrunkCount = 0;
    randomModeStuck = false;
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
    currentScenario.setup(blocksToAttribute);

    blocksRemovedCount = 0;
    scenarioCompleted = false;
    let congratsElement = document.getElementById("congratsMessage");
    if (congratsElement){
        congratsElement.style.display = "none";
    }
}


function handleCarEatingStars(){
    if (!starsEatable) { return; }

    for (var c of cars){
        if (c.turnCount < 3) { continue; }

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

function removeTrunk(trunk){
    let index = trunks.indexOf(trunk);
    if (index === -1) { return; }
    trunks.splice(index, 1);

    trunkLinks = trunkLinks.filter(link => link.a !== trunk && link.b !== trunk);
    for (var other of trunks){
        if (other.spawnedTrunk === trunk){
            other.spawnedTrunk = null;
        }
    }

    gsap.killTweensOf(trunk);
    trunkLayerDirty = true;

    let keptBranches = [];
    for (var b of branches){
        if (b.parentTrunk === trunk || b.childTrunk === trunk){
            gsap.killTweensOf(b);
        } else {
            keptBranches.push(b);
        }
    }
    branches = keptBranches;
    branchLayerDirty = true;
}

function handleCarEatingTrunks(){
    if (!starsEatable) { return; }

    for (var c of cars){
        if (c.turnCount < 3) { continue; }

        for (var t of trunks.slice()){
            let dx = c.x - t.x;
            let dy = c.y - t.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < carEatDistance){
                removeTrunk(t);
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

    maybeTriggerRandomShines(frameInterval / 1000);

    canvasdraw.fillStyle = "rgba(255, 255, 255, 0.75)";
    canvasdraw.fillRect(0, 0, canvas.width, canvas.height);
    canvasdraw.drawImage(backgroundLayer, 0, 0);

    handleCarEatingStars();
    handleCarEatingTrunks();
    for (var e of effects){
        if (e.done || !(e instanceof Star)) { continue; }
        e.draw();
    }
    if (branchLayerDirty){
        rebuildBranchLayer();
    }
    canvasdraw.drawImage(branchLayer, 0, 0);
    for (var b of branches){
        if (!b.settled){ b.draw(canvasdraw); }
    }
    if (trunkLayerDirty){
        rebuildTrunkLayer();
    }
    canvasdraw.drawImage(trunkLayer, 0, 0);
    for (var t of trunks){
        if (!t.settled){ t.draw(canvasdraw); }
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

    if (randomMode && !randomModeStuck && !hasPendingAnimation()){
        performRandomMove();
    }
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
