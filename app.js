
(() => {
"use strict";

const JUMPS = {
  4:14,9:31,20:38,28:84,40:59,51:67,63:81,71:91,
  17:7,54:34,62:19,64:60,87:24,93:73,95:75,99:78
};
const DICE = ["⚀","⚁","⚂","⚃","⚄","⚅"];

const $ = id => document.getElementById(id);
const views = ["setupView","homeView","roomView"];

let db, auth, uid = null;
let roomCode = null;
let roomRef = null;
let roomListener = null;
let messagesListener = null;
let currentRoom = null;

function show(id){
  views.forEach(v => $(v).classList.toggle("hidden", v !== id));
  $("homeBtn").classList.toggle("hidden", id === "homeView" || id === "setupView");
}

function cleanName(value){
  return (value || "").trim().replace(/\s+/g," ").slice(0,20);
}
function cleanCode(value){
  return (value || "").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);
}
function randomCode(){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for(let i=0;i<6;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}
function toast(msg){
  $("toast").textContent = msg;
  $("toast").classList.remove("hidden");
  clearTimeout(toast.t);
  toast.t = setTimeout(()=>$("toast").classList.add("hidden"),2200);
}
function escapeForText(text){ return String(text ?? ""); }

function buildBoard(){
  const board = $("board");
  board.innerHTML = "";
  for(let visualIndex=0; visualIndex<100; visualIndex++){
    const rowFromTop = Math.floor(visualIndex/10);
    const col = visualIndex % 10;
    const rowFromBottom = 9-rowFromTop;
    const base = rowFromBottom*10;
    const n = rowFromBottom%2===0 ? base+col+1 : base+(10-col);

    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.n = n;
    cell.textContent = n;

    if(JUMPS[n]){
      const jump = document.createElement("div");
      jump.className = "jump";
      jump.textContent = JUMPS[n] > n ? "🪜" : "🐍";
      jump.title = `${n} → ${JUMPS[n]}`;
      cell.appendChild(jump);
    }
    const tokens = document.createElement("div");
    tokens.className = "tokens";
    cell.appendChild(tokens);
    board.appendChild(cell);
  }
}

function renderTokens(game, playerIds){
  document.querySelectorAll(".tokens").forEach(e=>e.textContent="");
  if(!game || !playerIds.length) return;
  playerIds.forEach((id,index)=>{
    const pos = game.positions?.[id] || 1;
    const holder = document.querySelector(`.cell[data-n="${pos}"] .tokens`);
    if(holder) holder.textContent += index===0 ? "💗" : "💜";
  });
}

function playerEntries(room){
  return Object.entries(room?.players || {}).sort((a,b)=>(a[1].joinedAt||0)-(b[1].joinedAt||0));
}

function renderRoom(room){
  currentRoom = room;
  const players = playerEntries(room);
  const ids = players.map(([id])=>id);
  $("roomCodeText").textContent = roomCode;
  $("playerCount").textContent = `${players.length}/2`;

  $("playersList").innerHTML = "";
  players.forEach(([id,p],idx)=>{
    const div = document.createElement("div");
    div.className = "player" + (id===uid ? " me" : "");
    const name = document.createElement("strong");
    name.textContent = p.name + (id===uid ? " (you)" : "");
    div.appendChild(name);
    if(id===room.hostUid){
      const tag=document.createElement("span");
      tag.className="host-tag";tag.textContent="HOST";div.appendChild(tag);
    }
    $("playersList").appendChild(div);
  });

  const ready = players.length===2;
  $("gameWaiting").classList.toggle("hidden", ready);
  $("gameArea").classList.toggle("hidden", !ready);
  $("resetGameBtn").classList.toggle("hidden", room.hostUid!==uid || !ready);

  if(!ready) return;

  const game = room.game || {};
  $("p1Name").textContent = players[0][1].name;
  $("p2Name").textContent = players[1][1].name;
  $("p1Pos").textContent = game.positions?.[ids[0]] || 1;
  $("p2Pos").textContent = game.positions?.[ids[1]] || 1;
  $("diceFace").textContent = game.lastRoll ? DICE[game.lastRoll-1] : "🎲";
  renderTokens(game,ids);

  const winner = game.winnerUid;
  if(winner){
    const wp = room.players[winner];
    $("gameStatus").textContent = `${wp?.name || "Someone"} wins! 🎉`;
    $("rollBtn").disabled = true;
  } else {
    const turnP = room.players[game.turnUid];
    const myTurn = game.turnUid === uid;
    $("gameStatus").textContent = myTurn ? "Your turn! 🎲" : `${turnP?.name || "Other player"}'s turn`;
    $("rollBtn").disabled = !myTurn;
  }
}

function renderMessages(messages){
  const wrap = $("messages");
  const nearBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 90;
  wrap.innerHTML = "";
  Object.entries(messages || {}).sort((a,b)=>(a[1].createdAt||0)-(b[1].createdAt||0)).slice(-80).forEach(([key,m])=>{
    const box=document.createElement("div");
    box.className="message"+(m.uid===uid?" mine":"");
    const head=document.createElement("div");
    head.className="msg-head";head.textContent=m.name || "Player";
    const text=document.createElement("div");
    text.className="msg-text";text.textContent=escapeForText(m.text);
    box.append(head,text);wrap.appendChild(box);
  });
  if(nearBottom) wrap.scrollTop=wrap.scrollHeight;
}

async function ensureInitialGame(code){
  const ref=db.ref(`rooms/${code}`);
  await ref.transaction(room=>{
    if(!room) return room;
    const players = Object.keys(room.players || {});
    if(players.length===2 && !room.game){
      room.game = {
        positions:{[players[0]]:1,[players[1]]:1},
        turnUid:players[0],
        lastRoll:0,
        winnerUid:null
      };
    }
    return room;
  });
}

async function createRoom(){
  const name=cleanName($("createName").value);
  if(!name){toast("Type your name first 💗");return;}
  $("createRoomBtn").disabled=true;
  try{
    let code;
    for(let tries=0;tries<12;tries++){
      code=randomCode();
      const snap=await db.ref(`rooms/${code}`).once("value");
      if(!snap.exists()) break;
      code=null;
    }
    if(!code) throw new Error("Could not make a room code.");

    await db.ref(`rooms/${code}`).set({
      hostUid:uid,
      createdAt:firebase.database.ServerValue.TIMESTAMP,
      players:{
        [uid]:{name,joinedAt:firebase.database.ServerValue.TIMESTAMP}
      }
    });
    enterRoom(code);
  }catch(err){
    console.error(err);toast("Couldn't create the room.");
  }finally{$("createRoomBtn").disabled=false;}
}

async function joinRoom(){
  const name=cleanName($("joinName").value);
  const code=cleanCode($("joinCode").value);
  if(!name){toast("Type your name first 💗");return;}
  if(code.length!==6){toast("That room code needs 6 characters.");return;}

  $("joinRoomBtn").disabled=true;
  try{
    const ref=db.ref(`rooms/${code}`);
    const result=await ref.transaction(room=>{
      if(!room) return; // abort
      room.players = room.players || {};
      if(room.players[uid]) {
        room.players[uid].name=name;
        return room;
      }
      if(Object.keys(room.players).length>=2) return; // abort
      room.players[uid]={name,joinedAt:Date.now()};
      return room;
    });
    if(!result.committed){
      const snap=await ref.once("value");
      toast(!snap.exists() ? "Room not found 👀" : "That room is full.");
      return;
    }
    await ensureInitialGame(code);
    enterRoom(code);
  }catch(err){
    console.error(err);toast("Couldn't join that room.");
  }finally{$("joinRoomBtn").disabled=false;}
}

function detachRoom(){
  if(roomRef && roomListener) roomRef.off("value",roomListener);
  if(roomRef && messagesListener) roomRef.child("messages").off("value",messagesListener);
  roomRef=roomListener=messagesListener=null;
  currentRoom=null;
}

function enterRoom(code){
  detachRoom();
  roomCode=code;
  roomRef=db.ref(`rooms/${code}`);
  sessionStorage.setItem("mummyHubRoom",code);
  show("roomView");

  roomListener=roomRef.on("value", snap=>{
    if(!snap.exists()){
      toast("That room was closed.");
      leaveLocal();
      return;
    }
    renderRoom(snap.val());
    if(playerEntries(snap.val()).length===2 && !snap.val().game) ensureInitialGame(code);
  });
  messagesListener=roomRef.child("messages").on("value",snap=>renderMessages(snap.val()));
}

async function leaveRoom(){
  if(!roomCode){leaveLocal();return;}
  try{
    const code=roomCode;
    const ref=db.ref(`rooms/${code}`);
    const snap=await ref.once("value");
    const room=snap.val();
    if(room){
      if(room.hostUid===uid){
        await ref.remove();
      }else{
        await ref.child(`players/${uid}`).remove();
        await ref.child("game").remove();
      }
    }
  }catch(e){console.error(e)}
  leaveLocal();
}
function leaveLocal(){
  detachRoom();roomCode=null;sessionStorage.removeItem("mummyHubRoom");show("homeView");
}

async function resetGame(){
  if(!currentRoom || currentRoom.hostUid!==uid) return;
  const players=playerEntries(currentRoom).map(([id])=>id);
  if(players.length!==2)return;
  await roomRef.child("game").set({
    positions:{[players[0]]:1,[players[1]]:1},
    turnUid:players[0],lastRoll:0,winnerUid:null
  });
}

async function roll(){
  if(!roomRef || !currentRoom) return;
  const roll=1+Math.floor(Math.random()*6);
  $("rollBtn").disabled=true;

  const gameRef=roomRef.child("game");
  const result=await gameRef.transaction(game=>{
    if(!game || game.winnerUid || game.turnUid!==uid) return;
    const ids=playerEntries(currentRoom).map(([id])=>id);
    if(ids.length!==2)return;
    let pos=(game.positions?.[uid]||1)+roll;
    if(pos>100) pos=game.positions?.[uid]||1;
    if(JUMPS[pos])pos=JUMPS[pos];

    game.positions=game.positions||{};
    game.positions[uid]=pos;
    game.lastRoll=roll;
    game.lastRollUid=uid;
    if(pos===100)game.winnerUid=uid;
    else game.turnUid=ids.find(id=>id!==uid);
    return game;
  });
  if(!result.committed) $("rollBtn").disabled=false;
}

async function sendMessage(e){
  e.preventDefault();
  const text=$("chatInput").value.trim().slice(0,200);
  if(!text || !roomRef || !currentRoom?.players?.[uid])return;
  $("chatInput").value="";
  try{
    await roomRef.child("messages").push({
      uid,
      name:currentRoom.players[uid].name,
      text,
      createdAt:firebase.database.ServerValue.TIMESTAMP
    });
  }catch(err){console.error(err);toast("Message didn't send.");}
}

function wire(){
  $("createRoomBtn").onclick=createRoom;
  $("joinRoomBtn").onclick=joinRoom;
  $("joinCode").addEventListener("input",e=>e.target.value=cleanCode(e.target.value));
  $("copyCodeBtn").onclick=async()=>{
    try{await navigator.clipboard.writeText(roomCode);toast("Room code copied!");}
    catch{toast(`Room code: ${roomCode}`);}
  };
  $("leaveRoomBtn").onclick=leaveRoom;
  $("homeBtn").onclick=leaveRoom;
  $("resetGameBtn").onclick=resetGame;
  $("rollBtn").onclick=roll;
  $("chatForm").addEventListener("submit",sendMessage);
}

async function init(){
  wire();buildBoard();
  const cfg=window.MUMMY_HUB_FIREBASE_CONFIG || {};
  const configured = cfg.apiKey && !String(cfg.apiKey).includes("PASTE_") &&
                     cfg.databaseURL && !String(cfg.databaseURL).includes("PASTE_");
  if(!configured){
    $("connectionBadge").textContent="Needs setup";
    $("connectionBadge").classList.add("offline");
    show("setupView");
    return;
  }

  try{
    firebase.initializeApp(cfg);
    auth=firebase.auth();
    db=firebase.database();

    await auth.signInAnonymously();
    uid=auth.currentUser.uid;
    $("connectionBadge").textContent="Online";
    $("connectionBadge").classList.add("online");
    show("homeView");

    const previous=sessionStorage.getItem("mummyHubRoom");
    if(previous){
      const snap=await db.ref(`rooms/${previous}/players/${uid}`).once("value");
      if(snap.exists()) enterRoom(previous);
      else sessionStorage.removeItem("mummyHubRoom");
    }
  }catch(err){
    console.error(err);
    $("connectionBadge").textContent="Setup error";
    $("connectionBadge").classList.add("offline");
    show("setupView");
    const p=document.createElement("p");
    p.textContent="Firebase connection error: "+err.message;
    document.querySelector(".setup-card").appendChild(p);
  }
}

init();
})();
