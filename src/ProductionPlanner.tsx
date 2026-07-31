"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import logoUrl from "./assets/CWEM-logoSM.jpg";

type Category = "cwemExternal" | "cmsClient" | "cmiClient" | "cmiStock" | "pressAssembly" | "cwemStock" | "internal" | "urgent" | "unavailable";
type Operator = { id: string; name: string; detail: string };
type PasteTarget = { global: number; operatorId: string; lane: number };
type ContextMenu = { x: number; y: number; job?: Job; target?: PasteTarget };
type Job = {
  id: string; title: string; description: string; operatorId: string | null;
  day: number; start: number; duration: number; lane: number; category: Category;
  color: string; machine: string; due: string; quantity: string; priority: number; week: string;
};

const START = 7 * 60;
const DAY_LENGTHS = [525, 525, 525, 525, 360]; // Mon–Thu 07:00–15:45, Fri 07:00–13:00
const TOTAL_MINUTES = DAY_LENGTHS.reduce((a, b) => a + b, 0);
const OPERATOR_HEIGHT = 96;
const LANE_HEIGHT = 32;
const palette: Record<Category, string> = {
  cwemExternal: "#d32f2f", cmsClient: "#f4c430", cmiClient: "#64b5f6",
  cmiStock: "#123a5a", pressAssembly: "#2e7d32", cwemStock: "#81c784",
  internal: "#d9dee3", urgent: "#f57c00", unavailable: "#555b61",
};
const categories: { id: Category; label: string }[] = [
  { id: "cwemExternal", label: "CWEM External Client" },
  { id: "cmsClient", label: "CMS Client" },
  { id: "cmiClient", label: "CMI Client" },
  { id: "cmiStock", label: "CMI Stock" },
  { id: "pressAssembly", label: "Press/Assembly Build" },
  { id: "cwemStock", label: "CWEM Stock Parts" },
  { id: "internal", label: "Internal Support" },
  { id: "urgent", label: "Urgent/Overdue" },
  { id: "unavailable", label: "Unavailable" },
];
const mondayOf = (date: Date) => { const d=new Date(date),day=d.getDay(); d.setDate(d.getDate()-(day===0?6:day-1)); d.setHours(0,0,0,0); return d; };
const addDays = (date: Date, n: number) => { const d=new Date(date); d.setDate(d.getDate()+n); return d; };
const workingDay = (date:Date) => {const d=new Date(date);if(d.getDay()===6)d.setDate(d.getDate()-1);if(d.getDay()===0)d.setDate(d.getDate()+1);d.setHours(0,0,0,0);return d;};
const shiftWorkingDay = (date:Date,amount:number) => {const d=new Date(date),step=amount<0?-1:1;for(let left=Math.abs(amount);left>0;){d.setDate(d.getDate()+step);if(d.getDay()!==0&&d.getDay()!==6)left--;}return d;};
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const CURRENT_WEEK = dateKey(mondayOf(new Date()));
const initialOperators: Operator[] = [
  {id:"op-1",name:"AB",detail:"CNC Machinist"},
  {id:"op-2",name:"JA",detail:"CNC Machinist"},
  {id:"op-3",name:"MM",detail:"CNC Machinist"},
  {id:"op-4",name:"WB",detail:"Manual Machinist"},
  {id:"op-5",name:"DH",detail:"Assembly Engineer"},
  {id:"op-6",name:"ND",detail:"Assembly Engineer"},
  {id:"op-7",name:"SB",detail:"Assembly Engineer"},
];
const initialJobs: Job[] = [];

const prettyDate = (d: Date) => d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
const timeLabel = (mins: number) => `${String(Math.floor(mins/60)).padStart(2,"0")}:${String(mins%60).padStart(2,"0")}`;
const dayOffset = (day: number) => DAY_LENGTHS.slice(0,day).reduce((a,b)=>a+b,0);
const absoluteToDay = (absolute: number) => { let left=absolute; for(let day=0;day<5;day++){ if(left<DAY_LENGTHS[day]) return {day,start:left}; left-=DAY_LENGTHS[day]; } return {day:4,start:DAY_LENGTHS[4]-15}; };
const parseTime = (value: string) => { const match=value.trim().match(/^(\d{1,2})[:.]?(\d{2})$/); if(!match)return null; const h=Number(match[1]),m=Number(match[2]); return h<24&&m<60?h*60+m:null; };
const contrastText = (hex:string) => { const clean=(hex||"").replace("#",""); if(!/^[0-9a-f]{6}$/i.test(clean))return "#ffffff"; const [r,g,b]=[0,2,4].map(i=>parseInt(clean.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)); return 0.2126*r+0.7152*g+0.0722*b>0.38?"#102438":"#ffffff"; };
const EPOCH_MONDAY = Math.floor(Date.UTC(2020,0,6)/86400000);
const dateOrdinal = (key:string) => { const [y,m,d]=key.split("-").map(Number); return Math.floor(Date.UTC(y,m-1,d)/86400000); };
const keyFromOrdinal = (ordinal:number) => new Date(ordinal*86400000).toISOString().slice(0,10);
const normalizeWeekKey = (key:string) => { const ordinal=dateOrdinal(key),weekday=new Date(ordinal*86400000).getUTCDay(); return keyFromOrdinal(ordinal-(weekday===0?6:weekday-1)); };
const weekGlobalStart = (week:string) => Math.round((dateOrdinal(normalizeWeekKey(week))-EPOCH_MONDAY)/7)*TOTAL_MINUTES;
const jobGlobalStart = (job:Job) => weekGlobalStart(job.week)+dayOffset(job.day)+job.start;
const positionFromGlobal = (global:number) => { let weekIndex=Math.floor(global/TOTAL_MINUTES),within=global-weekIndex*TOTAL_MINUTES; if(within<0){weekIndex--;within+=TOTAL_MINUTES;} const placed=absoluteToDay(Math.min(within,TOTAL_MINUTES-15)); return {week:keyFromOrdinal(EPOCH_MONDAY+weekIndex*7),day:placed.day,start:placed.start}; };
const dateTimeFromGlobal = (global:number,preferEnd=false) => { let weekIndex=Math.floor(global/TOTAL_MINUTES),within=global-weekIndex*TOTAL_MINUTES; if(within<0){weekIndex--;within+=TOTAL_MINUTES;} if(preferEnd&&within===0){weekIndex--;within=TOTAL_MINUTES;} let day=0,minute=within; for(;day<5;day++){if(minute<DAY_LENGTHS[day]||(!preferEnd&&minute===0))break;if(preferEnd&&minute===DAY_LENGTHS[day])break;minute-=DAY_LENGTHS[day];} day=Math.min(day,4); return {date:keyFromOrdinal(EPOCH_MONDAY+weekIndex*7+day),time:timeLabel(START+minute)}; };
const globalFromDateTime = (date:string,time:string,isEnd=false) => { if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null; const ordinal=dateOrdinal(date),weekday=new Date(ordinal*86400000).getUTCDay(),day=weekday-1,clock=parseTime(time); if(day<0||day>4||clock===null)return null; const offset=clock-START,length=DAY_LENGTHS[day]; if(offset<0||offset>length||(!isEnd&&offset===length))return null; const mondayOrdinal=ordinal-day,weekIndex=Math.round((mondayOrdinal-EPOCH_MONDAY)/7); return weekIndex*TOTAL_MINUTES+dayOffset(day)+offset; };
const shiftCollidingJobs = (jobs: Job[], movedId: string) => {
  const moved = jobs.find(job => job.id === movedId);
  if (!moved?.operatorId) return jobs;
  const movedStart = jobGlobalStart(moved);
  const laneJobs = jobs
    .filter(job => job.id !== movedId && job.operatorId === moved.operatorId && (moved.category === "unavailable" || job.category === "unavailable" || job.lane === moved.lane))
    .sort((a, b) => jobGlobalStart(a) - jobGlobalStart(b));

  // Keep jobs before the insertion point fixed. If the drop lands inside one,
  // place the incoming job immediately after it rather than rescheduling it.
  const precedingEnd = laneJobs.reduce((end, job) => {
    const start = jobGlobalStart(job);
    return start < movedStart ? Math.max(end, start + job.duration) : end;
  }, movedStart);
  const placedMovedStart = Math.max(movedStart, precedingEnd);
  const movedPosition = positionFromGlobal(placedMovedStart);
  const movedWithPosition = { ...moved, week: movedPosition.week, day: movedPosition.day, start: movedPosition.start };
  let nextAvailable = placedMovedStart + moved.duration;

  const shifted = new Map<string, Job>();
  laneJobs.forEach(job => {
    const start = jobGlobalStart(job);
    const end = start + job.duration;
    if (job.category === "unavailable") {
      nextAvailable = Math.max(nextAvailable, end);
      return;
    }
    if (start < movedStart) return;
    const placedStart = Math.max(start, nextAvailable);
    const placed = positionFromGlobal(placedStart);
    shifted.set(job.id, { ...job, week: placed.week, day: placed.day, start: placed.start });
    nextAvailable = placedStart + job.duration;
  });
  return jobs.map(job => job.id === movedId ? movedWithPosition : shifted.get(job.id) || job);
};
const legacyCategories: Record<string,Category> = { external:"cwemExternal", press:"pressAssembly", setup:"internal", internal:"internal", urgent:"urgent", unavailable:"unavailable" };
const legacyColours: Record<string,string> = { external:"#1677b9", press:"#398c57", internal:"#d27b2c", setup:"#7954a2", urgent:"#c94b4b", unavailable:"#7c8992" };
const blankJob = (week=CURRENT_WEEK): Job => ({ id:"",title:"",description:"",operatorId:null,day:0,start:0,duration:60,lane:0,category:"cwemExternal",color:palette.cwemExternal,machine:"",due:"",quantity:"",priority:0,week });
const normalizeJob = (j: Partial<Job>): Job => { const legacy=legacyCategories[String(j.category)],category=(categories.some(c=>c.id===j.category)?j.category:legacy)||"cwemExternal",oldPreset=legacyColours[String(j.category)],color=!j.color||(legacy&&j.color.toLowerCase()===oldPreset)?palette[category]:j.color; return ({ ...blankJob(), ...j, category, priority:Number(j.priority)||0, week:normalizeWeekKey(j.week||CURRENT_WEEK), lane:Math.max(0,Math.min(2,j.lane??0)), color } as Job); };

export default function ProductionPlanner(){
  const [operators,setOperators]=useState(initialOperators);
  const [jobs,setJobs]=useState(initialJobs);
  const [weekStart,setWeekStart]=useState(()=>mondayOf(new Date()));
  const [monthCursor,setMonthCursor]=useState(()=>{const now=new Date();return new Date(now.getFullYear(),now.getMonth(),1);});
  const [dayCursor,setDayCursor]=useState(()=>workingDay(new Date()));
  const [viewMode,setViewMode]=useState<"day"|"week"|"month">("month");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [editor,setEditor]=useState<Job|null>(null);
  const [startText,setStartText]=useState("07:00");
  const [startDateText,setStartDateText]=useState(CURRENT_WEEK);
  const [endText,setEndText]=useState("08:00");
  const [endDateText,setEndDateText]=useState(CURRENT_WEEK);
  const [estimatedHoursText,setEstimatedHoursText]=useState("1");
  const [showBacklog,setShowBacklog]=useState(true);
  const [notice,setNotice]=useState("");
  const [copiedJob,setCopiedJob]=useState<Job|null>(null);
  const [contextMenu,setContextMenu]=useState<ContextMenu|null>(null);
  const [draggedJobId,setDraggedJobId]=useState<string|null>(null);
  const [confirmation,setConfirmation]=useState<{message:string;action:()=>void}|null>(null);
  const [sortMode,setSortMode]=useState<"manual"|"revenue"|"priority"|"machine"|"operator"|"duration"|"allocated"|"unallocated">("manual");
  const boardRef=useRef<HTMLDivElement>(null),monthBoardRef=useRef<HTMLDivElement>(null),fileRef=useRef<HTMLInputElement>(null),hydrated=useRef(false),jobsRef=useRef<Job[]>(initialJobs),undoStack=useRef<Job[][]>([]);

  useEffect(()=>{ try{ const saved=localStorage.getItem("cwem-production-planner-v1"); if(saved){ const data=JSON.parse(saved); if(Array.isArray(data.jobs))setJobs(data.jobs.map(normalizeJob).map((job:Job)=>job.operatorId==="op-8"?{...job,operatorId:null}:job)); if(Array.isArray(data.operators))setOperators(data.operators.filter((op:Operator)=>op.id!=="op-8").map((op:Operator)=>{const updated=initialOperators.find(item=>item.id===op.id);return updated?{...op,name:updated.name,detail:updated.detail}:op;})); } }catch{} hydrated.current=true; },[]);
  useEffect(()=>{ if(hydrated.current)localStorage.setItem("cwem-production-planner-v1",JSON.stringify({jobs,operators})); },[jobs,operators]);
  useEffect(()=>{jobsRef.current=jobs;},[jobs]);
  useEffect(()=>{const undo=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();const previous=undoStack.current.pop();if(previous)setJobs(previous);else flash("Nothing to undo");}};window.addEventListener("keydown",undo);return()=>window.removeEventListener("keydown",undo);},[]);
  useEffect(()=>{const close=()=>setContextMenu(null),escape=(e:KeyboardEvent)=>{if(e.key==="Escape")close();};window.addEventListener("click",close);window.addEventListener("keydown",escape);return()=>{window.removeEventListener("click",close);window.removeEventListener("keydown",escape);};},[]);

  const currentWeekKey=dateKey(weekStart),currentWeekGlobal=weekGlobalStart(currentWeekKey);
  const dayWeek=mondayOf(dayCursor),dayIndex=Math.max(0,Math.min(4,dayCursor.getDay()-1)),dayGlobalStart=weekGlobalStart(dateKey(dayWeek))+dayOffset(dayIndex),dayLength=DAY_LENGTHS[dayIndex];
  const detailGlobalStart=viewMode==="day"?dayGlobalStart:currentWeekGlobal,detailTotal=viewMode==="day"?dayLength:TOTAL_MINUTES;
  const detailDays=viewMode==="day"?[{date:dayCursor,length:dayLength}]:DAY_LENGTHS.map((length,day)=>({date:addDays(weekStart,day),length}));
  const segmentForWeek=(job:Job,weekKey:string)=>{const weekGlobal=weekGlobalStart(weekKey),start=jobGlobalStart(job),end=start+job.duration,segmentStart=Math.max(start,weekGlobal),segmentEnd=Math.min(end,weekGlobal+TOTAL_MINUTES);return segmentEnd>segmentStart?{start:segmentStart-weekGlobal,duration:segmentEnd-segmentStart,startsBefore:start<weekGlobal,endsAfter:end>weekGlobal+TOTAL_MINUTES}:null;};
  const segmentFor=(job:Job)=>{const start=jobGlobalStart(job),end=start+job.duration,segmentStart=Math.max(start,detailGlobalStart),segmentEnd=Math.min(end,detailGlobalStart+detailTotal);return segmentEnd>segmentStart?{start:segmentStart-detailGlobalStart,duration:segmentEnd-segmentStart,startsBefore:start<detailGlobalStart,endsAfter:end>detailGlobalStart+detailTotal}:null;};
  const scheduled=jobs.filter(j=>j.operatorId&&segmentFor(j)),backlog=jobs.filter(j=>!j.operatorId);
  const sortedJobs=useMemo(()=>{const categoryLabel=(id:Category)=>categories.find(c=>c.id===id)?.label||id;const operatorName=(id:string|null)=>operators.find(o=>o.id===id)?.name||"Unscheduled";return [...jobs].sort((a,b)=>{if(sortMode==="manual")return jobs.indexOf(a)-jobs.indexOf(b);if(sortMode==="revenue")return categoryLabel(a.category).localeCompare(categoryLabel(b.category));if(sortMode==="priority")return (a.priority||Infinity)-(b.priority||Infinity);if(sortMode==="machine")return (a.machine||"ZZZ").localeCompare(b.machine||"ZZZ");if(sortMode==="operator")return operatorName(a.operatorId).localeCompare(operatorName(b.operatorId));if(sortMode==="allocated")return Number(Boolean(b.operatorId))-Number(Boolean(a.operatorId));if(sortMode==="unallocated"){const allocation=Number(Boolean(a.operatorId))-Number(Boolean(b.operatorId));return allocation||categoryLabel(a.category).localeCompare(categoryLabel(b.category));}return a.duration-b.duration;});},[jobs,operators,sortMode]);
  const weekLabel=`${prettyDate(weekStart)} – ${prettyDate(addDays(weekStart,4))} ${addDays(weekStart,4).getFullYear()}`;
  const dayLabel=dayCursor.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const monthDate=new Date(monthCursor.getFullYear(),monthCursor.getMonth(),1);
  const monthGridStart=mondayOf(new Date());
  const monthLast=new Date(monthDate.getFullYear(),monthDate.getMonth()+1,0);
  const monthLastWeek=mondayOf(monthLast);
  const monthWeeks=4;
  const monthTotalMinutes=monthWeeks*TOTAL_MINUTES;
  const monthGlobalStart=weekGlobalStart(dateKey(monthGridStart));
  const monthLabel=`${prettyDate(monthGridStart)} – ${prettyDate(addDays(monthGridStart,25))}`;
  const monthJobs=jobs.filter(j=>j.operatorId&&jobGlobalStart(j)<monthGlobalStart+monthTotalMinutes&&jobGlobalStart(j)+j.duration>monthGlobalStart);
  const shiftMonth=(amount:number)=>setMonthCursor(new Date(monthDate.getFullYear(),monthDate.getMonth()+amount,1));
  const metrics=useMemo(()=>{ const visible=viewMode==="month"?monthJobs:scheduled,planned=visible.reduce((n,j)=>{if(viewMode!=="month")return n+(segmentFor(j)?.duration||0);const start=Math.max(jobGlobalStart(j),monthGlobalStart),end=Math.min(jobGlobalStart(j)+j.duration,monthGlobalStart+monthTotalMinutes);return n+Math.max(0,end-start);},0)/60,capacity=operators.length*((viewMode==="month"?monthTotalMinutes:detailTotal)/60); return {planned,utilisation:capacity?Math.round(planned/capacity*100):0,urgent:visible.filter(j=>j.category==="urgent").length}; },[scheduled,operators,jobs,currentWeekGlobal,dayGlobalStart,detailTotal,viewMode,monthGlobalStart,monthTotalMinutes,monthWeeks]);
  const flash=(message:string)=>{setNotice(message);window.setTimeout(()=>setNotice(""),1800);};
  const openEditor=(job:Job)=>{const start=jobGlobalStart(job),end=start+job.duration,startDT=dateTimeFromGlobal(start),endDT=dateTimeFromGlobal(end,true);setEditor({...job,week:job.week||currentWeekKey});setStartDateText(startDT.date);setStartText(startDT.time);setEndDateText(endDT.date);setEndText(endDT.time);setEstimatedHoursText((job.duration/60).toFixed(2));};
  const saveEditor=()=>{if(!editor||!editor.title.trim())return;const startGlobal=globalFromDateTime(startDateText,startText),manualEndGlobal=globalFromDateTime(endDateText,endText,true),estimatedHours=Number(estimatedHoursText);if(startGlobal===null){flash("Choose a weekday and a start time within working hours");return;}const endGlobal=Number.isFinite(estimatedHours)&&estimatedHours>0?startGlobal+estimatedHours*60:manualEndGlobal;if(endGlobal===null){flash("Enter a valid estimated job duration");return;}if(endGlobal<=startGlobal){flash("Estimated hours must be greater than zero");return;}const placed=positionFromGlobal(startGlobal),next={...editor,id:editor.id||`job-${Date.now()}`,week:placed.week,day:placed.day,start:placed.start,duration:endGlobal-startGlobal,lane:Math.max(0,Math.min(2,editor.lane)),color:editor.color||palette[editor.category]};setJobs(old=>{const updated=editor.id?old.map(j=>j.id===editor.id?next:j):[...old,next];return next.operatorId?shiftCollidingJobs(updated,next.id):updated;});setEditor(null);flash(editor.id?"Job updated":"Job added");};
  const removeJob=(id:string)=>setConfirmation({message:"Delete this job?",action:()=>{setJobs(old=>old.filter(j=>j.id!==id));setEditor(null);setSelectedId(null);flash("Job deleted");}});
  const addOperator=()=>{const name=window.prompt("New operator name");if(!name?.trim())return;setOperators(old=>[...old,{id:`op-${Date.now()}`,name:name.trim(),detail:"Production"}]);flash("Operator added");};
  const editOperator=(op:Operator)=>{const name=window.prompt("Operator name",op.name);if(name?.trim())setOperators(old=>old.map(o=>o.id===op.id?{...o,name:name.trim()}:o));};
  const removeOperator=(op:Operator)=>setConfirmation({message:`Remove ${op.name}? Their scheduled jobs will return to Unscheduled.`,action:()=>{setJobs(old=>old.map(j=>j.operatorId===op.id?{...j,operatorId:null}:j));setOperators(old=>old.filter(o=>o.id!==op.id));flash("Operator removed");}});

  const openJobMenu=(e:React.MouseEvent,job:Job)=>{e.preventDefault();e.stopPropagation();setSelectedId(job.id);setContextMenu({x:Math.min(e.clientX,window.innerWidth-190),y:Math.min(e.clientY,window.innerHeight-120),job});};
  const openGridMenu=(e:React.MouseEvent,board:HTMLDivElement|null,total:number,globalStart:number,rowHeight:number,laneHeight:number)=>{e.preventDefault();if(!board||!operators.length)return;const rect=board.getBoundingClientRect(),x=Math.max(0,Math.min(rect.width,e.clientX-rect.left)),y=Math.max(0,Math.min(rect.height-1,e.clientY-rect.top)),row=Math.max(0,Math.min(operators.length-1,Math.floor(y/rowHeight))),lane=Math.max(0,Math.min(2,Math.floor((y-row*rowHeight)/laneHeight)));setContextMenu({x:Math.min(e.clientX,window.innerWidth-190),y:Math.min(e.clientY,window.innerHeight-90),target:{global:globalStart+Math.round((x/rect.width*total)/15)*15,operatorId:operators[row].id,lane}});};
  const copyJob=(job:Job)=>{setCopiedJob({...job});setContextMenu(null);flash(`${job.title} copied — right-click an empty slot to paste`);};
  const pasteJob=(target:PasteTarget)=>{if(!copiedJob)return;const placed=positionFromGlobal(target.global),copy={...copiedJob,id:`job-${Date.now()}`,week:placed.week,day:placed.day,start:placed.start,operatorId:target.operatorId,lane:target.lane};setJobs(old=>shiftCollidingJobs([...old,copy],copy.id));setSelectedId(copy.id);setContextMenu(null);flash("Job pasted");};
  const scheduleAt=(jobId:string,target:PasteTarget)=>{const placed=positionFromGlobal(target.global);setJobs(old=>shiftCollidingJobs(old.map(job=>job.id===jobId?{...job,week:placed.week,day:placed.day,start:placed.start,operatorId:target.operatorId,lane:target.lane}:job),jobId));setSelectedId(jobId);setDraggedJobId(null);flash("Job scheduled");};
  const dropTarget=(e:React.DragEvent,board:HTMLDivElement|null,total:number,globalStart:number,rowHeight:number,laneHeight:number):PasteTarget|null=>{if(!board||!draggedJobId)return null;const rect=board.getBoundingClientRect(),x=Math.max(0,Math.min(rect.width,e.clientX-rect.left)),y=Math.max(0,Math.min(rect.height-1,e.clientY-rect.top)),row=Math.max(0,Math.min(operators.length-1,Math.floor(y/rowHeight))),lane=Math.max(0,Math.min(2,Math.floor((y-row*rowHeight)/laneHeight)));return{global:globalStart+Math.round((x/rect.width*total)/15)*15,operatorId:operators[row].id,lane};};
  const reorderJob=(sourceId:string,targetId:string)=>{if(sourceId===targetId)return;setJobs(old=>{const source=old.findIndex(job=>job.id===sourceId),target=old.findIndex(job=>job.id===targetId);if(source<0||target<0)return old;const next=[...old],[item]=next.splice(source,1);next.splice(target,0,item);return next;});};
  const clearSchedule=()=>{if(!jobs.some(job=>job.operatorId))return;setConfirmation({message:"Clear the entire schedule? Jobs will remain available in the job list.",action:()=>{setJobs(old=>old.map(job=>({...job,operatorId:null})));setSelectedId(null);flash("Schedule cleared");}});};
  const addUnavailability=()=>openEditor({...blankJob(currentWeekKey),title:"Operator unavailable",description:"Holiday / planned absence",duration:480,category:"unavailable",color:palette.unavailable});
  const beginUndoableAction=()=>{undoStack.current.push(jobsRef.current.map(job=>({...job})));if(undoStack.current.length>100)undoStack.current.shift();};

  const beginPointer=(e:React.PointerEvent,job:Job,mode:"move"|"left"|"right")=>{
    e.preventDefault();e.stopPropagation();beginUndoableAction();setSelectedId(job.id);const board=boardRef.current;if(!board)return;
    const startX=e.clientX,startY=e.clientY,original={...job},width=board.getBoundingClientRect().width;
    const onMove=(ev:PointerEvent)=>{const delta=Math.round(((ev.clientX-startX)/width*detailTotal)/15)*15;setJobs(old=>old.map(j=>{if(j.id!==job.id)return j;
      const originalGlobal=jobGlobalStart(original);
      if(mode==="right")return{...j,duration:Math.max(15,original.duration+delta)};
      if(mode==="left"){const shift=Math.min(original.duration-15,delta),placed=positionFromGlobal(originalGlobal+shift);return{...j,week:placed.week,day:placed.day,start:placed.start,duration:original.duration-shift};}
      const placed=positionFromGlobal(originalGlobal+delta);
      const oldOp=operators.findIndex(o=>o.id===original.operatorId),oldTrack=oldOp*3+(original.lane||0),track=Math.max(0,Math.min(operators.length*3-1,oldTrack+Math.round((ev.clientY-startY)/LANE_HEIGHT)));
      return{...j,week:placed.week,day:placed.day,start:placed.start,duration:original.duration,operatorId:operators[Math.floor(track/3)]?.id||j.operatorId,lane:track%3}; }));};
    const onUp=()=>{window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerup",onUp);setJobs(old=>shiftCollidingJobs(old,job.id));flash("Schedule updated");};window.addEventListener("pointermove",onMove);window.addEventListener("pointerup",onUp);
  };

  const beginMonthPointer=(e:React.PointerEvent,job:Job,mode:"move"|"left"|"right")=>{
    e.preventDefault();e.stopPropagation();beginUndoableAction();setSelectedId(job.id);const board=monthBoardRef.current;if(!board)return;
    const startX=e.clientX,startY=e.clientY,original={...job},width=board.getBoundingClientRect().width;
    const onMove=(ev:PointerEvent)=>{const delta=Math.round(((ev.clientX-startX)/width*monthTotalMinutes)/15)*15;setJobs(old=>old.map(j=>{if(j.id!==job.id)return j;const originalGlobal=jobGlobalStart(original);
      if(mode==="right")return{...j,duration:Math.max(15,original.duration+delta)};
      if(mode==="left"){const shift=Math.min(original.duration-15,delta),placed=positionFromGlobal(originalGlobal+shift);return{...j,week:placed.week,day:placed.day,start:placed.start,duration:original.duration-shift};}
      const placed=positionFromGlobal(originalGlobal+delta),oldOp=operators.findIndex(o=>o.id===original.operatorId),oldTrack=oldOp*3+(original.lane||0),track=Math.max(0,Math.min(operators.length*3-1,oldTrack+Math.round((ev.clientY-startY)/24)));return{...j,week:placed.week,day:placed.day,start:placed.start,operatorId:operators[Math.floor(track/3)]?.id||j.operatorId,lane:track%3};}));};
    const onUp=()=>{window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerup",onUp);setJobs(old=>shiftCollidingJobs(old,job.id));flash(mode==="move"?"Schedule updated":"Job duration updated");};window.addEventListener("pointermove",onMove);window.addEventListener("pointerup",onUp);
  };

  const exportData=()=>{const blob=new Blob([JSON.stringify({version:2,exported:new Date().toISOString(),operators,jobs},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`CWEM-production-plan-${dateKey(weekStart)}.json`;a.click();URL.revokeObjectURL(a.href);flash("Backup downloaded");};
  const importData=async(e:React.ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.jobs)||!Array.isArray(data.operators))throw new Error();setJobs(data.jobs.map(normalizeJob));setOperators(data.operators);flash("Plan restored");}catch{flash("That backup could not be read");}e.target.value="";};
  const scheduleBacklog=(job:Job,operatorId:string)=>{if(!operatorId)return;setJobs(old=>shiftCollidingJobs(old.map(j=>j.id===job.id?{...j,operatorId,lane:0}:j),job.id));};
  const unallocateJob=(jobId:string)=>{setJobs(old=>old.map(job=>job.id===jobId?{...job,operatorId:null,lane:0}:job));setSelectedId(null);flash("Job unallocated");};
  const editorStartGlobal=globalFromDateTime(startDateText,startText),editorEndGlobal=globalFromDateTime(endDateText,endText,true),estimatedHours=Number(estimatedHoursText),calculatedEndGlobal=editorStartGlobal!==null&&Number.isFinite(estimatedHours)&&estimatedHours>0?editorStartGlobal+estimatedHours*60:null,calculatedEnd=calculatedEndGlobal===null?null:dateTimeFromGlobal(calculatedEndGlobal,true),editorHours=estimatedHours>0&&Number.isFinite(estimatedHours)?estimatedHours:null;

  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark"><img src={logoUrl} alt="CWEM" /></div><div className="brand-copy"><span>CWEM OPERATIONS</span><h1>Production Planner</h1></div><div className="header-actions"><button className="button ghost" onClick={()=>window.print()}>▣ Print 4 Weeks / PDF</button><button className="button ghost" onClick={exportData}>↓ Backup</button><button className="button ghost" onClick={()=>fileRef.current?.click()}>↑ Restore</button><input ref={fileRef} type="file" accept="application/json" hidden onChange={importData}/><button className="button ghost" onClick={addOperator}>＋ Operator</button><button className="button ghost" onClick={addUnavailability}>＋ Unavailability</button><button className="button primary" onClick={()=>openEditor(blankJob(currentWeekKey))}>＋ Add job</button></div></header>
    <section className="summary-strip"><div><span>{viewMode==="day"?"Planning day":viewMode==="week"?"Week commencing":"Planning month"}</span><strong>{viewMode==="day"?prettyDate(dayCursor):viewMode==="week"?prettyDate(weekStart):monthLabel}</strong></div><div><span>Planned hours</span><strong>{metrics.planned.toFixed(1)} h</strong></div><div><span>Indicative loading</span><strong>{metrics.utilisation}%</strong></div><div><span>Unscheduled</span><strong>{backlog.length}</strong></div><div className={metrics.urgent?"urgent-metric":""}><span>Urgent jobs</span><strong>{metrics.urgent}</strong></div></section>
    <section className="planner-card"><div className="planner-toolbar"><div className="week-nav"><button aria-label={viewMode==="day"?"Previous working day":viewMode==="week"?"Previous week":"Previous month"} onClick={()=>viewMode==="day"?setDayCursor(shiftWorkingDay(dayCursor,-1)):viewMode==="week"?setWeekStart(addDays(weekStart,-7)):shiftMonth(-1)}>‹</button><button className="today" onClick={()=>{const now=new Date();if(viewMode==="day")setDayCursor(workingDay(now));else if(viewMode==="week")setWeekStart(mondayOf(now));else setMonthCursor(new Date(now.getFullYear(),now.getMonth(),1));}}>Today</button><button aria-label={viewMode==="day"?"Next working day":viewMode==="week"?"Next week":"Next month"} onClick={()=>viewMode==="day"?setDayCursor(shiftWorkingDay(dayCursor,1)):viewMode==="week"?setWeekStart(addDays(weekStart,7)):shiftMonth(1)}>›</button><h2>{viewMode==="day"?dayLabel:viewMode==="week"?weekLabel:monthLabel}</h2></div>{viewMode==="week"&&<div className="four-week-nav" aria-label="Four week planning horizon">{Array.from({length:4},(_,i)=>{const d=addDays(mondayOf(new Date()),i*7);return <button className={dateKey(d)===currentWeekKey?"active":""} key={i} onClick={()=>setWeekStart(d)}>W{i+1}<span>{prettyDate(d)}</span></button>;})}</div>}<div className="toolbar-right"><div className="toolbar-colour-key">{categories.map(c=><span key={c.id} title={c.label}><i style={{backgroundColor:palette[c.id]}} />{c.label} ({jobs.filter(job=>job.category===c.id).length})</span>)}</div><div className="view-switch" aria-label="Planner view"><button className={viewMode==="day"?"active":""} onClick={()=>{setDayCursor(workingDay(weekStart));setViewMode("day");}}>Day</button><button className={viewMode==="week"?"active":""} onClick={()=>setViewMode("week")}>Week</button><button className={viewMode==="month"?"active":""} onClick={()=>{setMonthCursor(new Date(weekStart.getFullYear(),weekStart.getMonth(),1));setViewMode("month");}}>Month</button></div><span className="autosave"><i/> Saved on this device</span><button className={`backlog-toggle ${showBacklog?"active":""}`} onClick={()=>setShowBacklog(!showBacklog)}>Job list ({jobs.length})</button></div></div>
      {viewMode!=="month"&&<div className={`planner-body ${showBacklog?"with-backlog":""}`}><div className="schedule-wrap">
        <div className="resource-head"><div><strong>OPERATORS</strong><span>Three concurrent job lanes</span></div><button onClick={addOperator} aria-label="Add operator">＋</button></div>
        <div className="timeline-head" style={{gridTemplateColumns:detailDays.map(d=>`${d.length}fr`).join(" ")}}>{detailDays.map(({date,length},day)=><div className="day-head" key={dateKey(date)}><strong>{date.toLocaleDateString("en-GB",{weekday:"short"})}</strong><span>{prettyDate(date)}</span><small>07:00–{timeLabel(START+length)}</small><div className="hours"><i>07:00</i><i>{timeLabel(START+Math.round(length/2))}</i><i>{timeLabel(START+length)}</i></div></div>)}</div>
        <div className="resource-list">{operators.map(op=><div key={op.id} className="resource-row"><span className="avatar">{op.name.replace("Operator ","").slice(0,2)}</span><button className="operator-name" onClick={()=>editOperator(op)}><strong>{op.name}</strong><small>{op.detail}</small></button><em>{(scheduled.filter(j=>j.operatorId===op.id).reduce((n,j)=>n+(segmentFor(j)?.duration||0),0)/60).toFixed(1)}h</em><button className="remove-operator" onClick={()=>removeOperator(op)} aria-label={`Remove ${op.name}`}>×</button></div>)}</div>
         <div className="timeline-grid" ref={boardRef} style={{height:operators.length*OPERATOR_HEIGHT}} onClick={()=>setSelectedId(null)} onDragOver={e=>{if(draggedJobId)e.preventDefault();}} onDrop={e=>{e.preventDefault();const target=dropTarget(e,boardRef.current,detailTotal,detailGlobalStart,OPERATOR_HEIGHT,LANE_HEIGHT);if(target&&draggedJobId)scheduleAt(draggedJobId,target);}} onContextMenu={e=>openGridMenu(e,boardRef.current,detailTotal,detailGlobalStart,OPERATOR_HEIGHT,LANE_HEIGHT)}>{operators.map(op=><div className="grid-row" key={op.id}><i/><i/><i/></div>)}{viewMode==="week"&&DAY_LENGTHS.map((_,i)=><i className="grid-line major" style={{left:`${dayOffset(i)/detailTotal*100}%`}} key={i}/>)}
          {Array.from({length:Math.floor(detailTotal/15)+1},(_,i)=><i className={`grid-line quarter ${i%4===0?"hour":""}`} style={{left:`${i*15/detailTotal*100}%`}} key={`q-${i}`}/>)} 
          {scheduled.map(job=>{const row=operators.findIndex(o=>o.id===job.operatorId),segment=segmentFor(job),background=job.color||palette[job.category];if(row<0||!segment)return null;return <article key={job.id} className={`job-bar ${segment.startsBefore?"continues-left":""} ${segment.endsAfter?"continues-right":""} ${selectedId===job.id?"selected":""}`} style={{left:`${segment.start/detailTotal*100}%`,width:`${segment.duration/detailTotal*100}%`,top:job.category==="unavailable"?4:row*OPERATOR_HEIGHT+(job.lane||0)*LANE_HEIGHT+4,height:job.category==="unavailable"?OPERATOR_HEIGHT-8:26,backgroundColor:background,color:contrastText(background)}} onPointerDown={e=>beginPointer(e,job,"move")} onDoubleClick={e=>{e.stopPropagation();openEditor(job);}} onContextMenu={e=>openJobMenu(e,job)} title={`${job.title}\n${job.description}\n${job.machine}\nLane ${(job.lane||0)+1} · Total working time ${job.duration/60}h`}>{!segment.startsBefore&&<button className="resize left" aria-label="Resize job start" onPointerDown={e=>beginPointer(e,job,"left")}/>}<div className="job-content"><strong>{segment.startsBefore?"← ":""}{job.title}{segment.endsAfter?" →":""}</strong><span>{job.machine||job.description||`${job.duration/60}h`}</span></div><button className="job-delete" aria-label="Delete job" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();removeJob(job.id);}}>×</button>{!segment.endsAfter&&<button className="resize right" aria-label="Resize job end" onPointerDown={e=>beginPointer(e,job,"right")}/>}</article>;})}
        </div>
      </div>{showBacklog&&<aside className="backlog-panel"><div className="backlog-head"><div><span>JOB LIST</span><strong>{jobs.length} jobs available · {backlog.length} unscheduled</strong></div><button onClick={clearSchedule}>Clear schedule</button><button onClick={()=>setShowBacklog(false)}>×</button></div><label className="sort-toolbar">Sort by<select value={sortMode} onChange={e=>setSortMode(e.target.value as "manual"|"revenue"|"priority"|"machine"|"operator"|"duration"|"allocated"|"unallocated")}><option value="manual">Manual order</option><option value="revenue">Revenue stream</option><option value="priority">Priority number</option><option value="machine">Machine</option><option value="operator">Operator</option><option value="duration">Duration</option><option value="allocated">Allocated</option><option value="unallocated">Unallocated</option></select></label><div className="backlog-list">{backlog.length===0&&<div className="empty-state">Everything is scheduled.</div>}{sortedJobs.map(job=>{const background=job.color||palette[job.category];return <article className="backlog-job" draggable onDragStart={e=>{e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",job.id);setDraggedJobId(job.id);}} onDragEnd={()=>setDraggedJobId(null)} onDragOver={e=>{if(draggedJobId&&draggedJobId!==job.id)e.preventDefault();}} onDrop={e=>{e.preventDefault();if(draggedJobId)reorderJob(draggedJobId,job.id);setDraggedJobId(null);}} style={{backgroundColor:background,color:contrastText(background)}} key={job.id} onDoubleClick={()=>openEditor(job)} onContextMenu={e=>openJobMenu(e,job)}><button className="backlog-delete" onClick={()=>removeJob(job.id)} aria-label="Delete job">×</button><div><strong>{job.title}</strong><span>{job.description||"No operation description"}</span><button type="button" className={`job-status ${job.operatorId?"allocated":"unallocated"}`} onClick={e=>{e.stopPropagation();if(job.operatorId)unallocateJob(job.id);}}>{job.operatorId?"✓ Allocated":"○ Unallocated"}</button></div><dl><div><dt>Machine</dt><dd>{job.machine||"TBC"}</dd></div><div><dt>Duration</dt><dd>{(job.duration/60).toFixed(1)} h</dd></div></dl><label>Allocate to<select value="" onChange={e=>scheduleBacklog(job,e.target.value)}><option value="">Choose operator…</option>{operators.map(o=><option value={o.id} key={o.id}>{o.name}</option>)}</select></label></article>})}</div><button className="add-backlog" onClick={()=>openEditor(blankJob(currentWeekKey))}>＋ Add unscheduled job</button></aside>}</div>}
      {viewMode==="month"&&<div className={`month-workspace ${showBacklog?"with-backlog":""}`}><div className="month-view">
        <div className="month-resource-head"><strong>OPERATORS</strong><span>Three concurrent job lanes</span></div>
        <div className="month-head" style={{gridTemplateColumns:`repeat(${monthWeeks}, minmax(0, 1fr))`}}>{Array.from({length:monthWeeks},(_,weekIndex)=>{const week=addDays(monthGridStart,weekIndex*7);return <div className="month-week-head" key={weekIndex}><strong>Week of {prettyDate(week)}</strong><div style={{gridTemplateColumns:DAY_LENGTHS.map(n=>`${n}fr`).join(" ")}}>{DAY_LENGTHS.map((_,day)=>{const date=addDays(week,day);return <span className="" key={day}>{date.toLocaleDateString("en-GB",{weekday:"short"})}<b>{date.getDate()}</b></span>;})}</div></div>;})}</div>
        <div className="month-resources">{operators.map(op=><div className="month-resource-row" key={op.id}><span className="avatar">{op.name.replace("Operator ","").slice(0,2)}</span><button className="operator-name" onClick={()=>editOperator(op)}><strong>{op.name}</strong><small>{op.detail}</small></button></div>)}</div>
        <div className="month-timeline" ref={monthBoardRef} style={{height:operators.length*72}} onClick={()=>setSelectedId(null)} onDragOver={e=>{if(draggedJobId)e.preventDefault();}} onDrop={e=>{e.preventDefault();const target=dropTarget(e,monthBoardRef.current,monthTotalMinutes,monthGlobalStart,72,24);if(target&&draggedJobId)scheduleAt(draggedJobId,target);}} onContextMenu={e=>openGridMenu(e,monthBoardRef.current,monthTotalMinutes,monthGlobalStart,72,24)}>
          {operators.map(op=><div className="month-grid-row" key={op.id}><i/><i/><i/></div>)}
          {Array.from({length:monthWeeks},(_,weekIndex)=>DAY_LENGTHS.map((_,day)=><i className={`month-grid-line ${day===0?"week-line":""}`} style={{left:`${(weekIndex*TOTAL_MINUTES+dayOffset(day))/monthTotalMinutes*100}%`}} key={`${weekIndex}-${day}`}/>))}
          {monthJobs.map(job=>{const row=operators.findIndex(o=>o.id===job.operatorId),start=jobGlobalStart(job),end=start+job.duration,segmentStart=Math.max(start,monthGlobalStart),segmentEnd=Math.min(end,monthGlobalStart+monthTotalMinutes),background=job.color||palette[job.category];if(row<0||segmentEnd<=segmentStart)return null;return <article className={`month-job ${start<monthGlobalStart?"continues-left":""} ${end>monthGlobalStart+monthTotalMinutes?"continues-right":""} ${selectedId===job.id?"selected":""}`} key={job.id} style={{left:`${(segmentStart-monthGlobalStart)/monthTotalMinutes*100}%`,width:`${(segmentEnd-segmentStart)/monthTotalMinutes*100}%`,top:job.category==="unavailable"?3:row*72+(job.lane||0)*24+3,height:job.category==="unavailable"?68:19,backgroundColor:background,color:contrastText(background)}} onPointerDown={e=>beginMonthPointer(e,job,"move")} onDoubleClick={()=>openEditor(job)} onContextMenu={e=>openJobMenu(e,job)} title={`${job.title}\n${job.description}\nDrag either end to resize · Double-click to edit`}>{start>=monthGlobalStart&&<button className="month-resize left" aria-label="Resize job start" onPointerDown={e=>beginMonthPointer(e,job,"left")}/>}<strong>{start<monthGlobalStart?"← ":""}{job.title}{end>monthGlobalStart+monthTotalMinutes?" →":""}</strong><span>{job.machine||job.description}</span>{end<=monthGlobalStart+monthTotalMinutes&&<button className="month-resize right" aria-label="Resize job end" onPointerDown={e=>beginMonthPointer(e,job,"right")}/>}</article>;})}
        </div>
        <p className="month-help">Drag jobs to move them or drag either end to adjust duration · weekends are excluded · double-click to edit</p>
       </div>{showBacklog&&<aside className="backlog-panel month-backlog"><div className="backlog-head"><div><span>JOB LIST</span><strong>{jobs.length} jobs available · {backlog.length} unscheduled</strong></div><button onClick={clearSchedule}>Clear schedule</button></div><label className="sort-toolbar">Sort by<select value={sortMode} onChange={e=>setSortMode(e.target.value as "manual"|"revenue"|"priority"|"machine"|"operator"|"duration"|"allocated"|"unallocated")}><option value="manual">Manual order</option><option value="revenue">Revenue stream</option><option value="priority">Priority number</option><option value="machine">Machine</option><option value="operator">Operator</option><option value="duration">Duration</option><option value="allocated">Allocated</option><option value="unallocated">Unallocated</option></select></label><div className="backlog-list">{jobs.length===0&&<div className="empty-state">No jobs yet.</div>}{sortedJobs.map(job=>{const background=job.color||palette[job.category];return <article className="backlog-job" draggable key={job.id} onDragStart={e=>{e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",job.id);setDraggedJobId(job.id);}} onDragEnd={()=>setDraggedJobId(null)} onDoubleClick={()=>openEditor(job)} style={{backgroundColor:background,color:contrastText(background)}}><button className="backlog-delete" onClick={()=>removeJob(job.id)} aria-label="Delete job">×</button><div><strong>{job.title||"Untitled job"}</strong><button type="button" className={`job-status ${job.operatorId?"allocated":"unallocated"}`} onClick={e=>{e.stopPropagation();if(job.operatorId)unallocateJob(job.id);}}>{job.operatorId?`✓ Allocated · ${operators.find(o=>o.id===job.operatorId)?.name||"Operator"}`:"○ Unallocated"}</button></div><dl><div><dt>Machine</dt><dd>{job.machine||"TBC"}</dd></div><div><dt>Duration</dt><dd>{(job.duration/60).toFixed(1)} h</dd></div></dl></article>})}</div><button className="add-backlog" onClick={()=>openEditor(blankJob(currentWeekKey))}>＋ Add job</button></aside>}</div>}
    </section>
    <section className="legend"><strong>COLOUR PRESETS</strong>{categories.map(c=><span key={c.id}><i className="dot" style={{backgroundColor:palette[c.id]}}/>{c.label}</span>)}<em>Every job colour can be manually changed</em></section>
    <section className="four-week-print" aria-hidden="true">
      <header className="print-title"><div><strong>CWEM</strong><span>PRODUCTION PLANNER</span></div><h1>Four Week Production Plan</h1><p>{prettyDate(mondayOf(new Date()))} – {prettyDate(addDays(mondayOf(new Date()),25))} {addDays(mondayOf(new Date()),25).getFullYear()}</p></header>
      <div className="print-colour-key">{categories.map(c=><span key={c.id}><i style={{backgroundColor:palette[c.id]}}/>{c.label}</span>)}</div>
      {Array.from({length:4},(_,weekIndex)=>{const printWeek=addDays(mondayOf(new Date()),weekIndex*7),printWeekKey=dateKey(printWeek),weekJobs=jobs.filter(j=>j.operatorId&&segmentForWeek(j,printWeekKey));return <article className="print-week" key={weekIndex}>
        <h2>Week {weekIndex+1} <span>Monday {prettyDate(printWeek)} – Friday {prettyDate(addDays(printWeek,4))}</span></h2>
        <div className="print-schedule">
          <div className="print-operator-head">OPERATOR</div>
          <div className="print-day-head" style={{gridTemplateColumns:DAY_LENGTHS.map(n=>`${n}fr`).join(" ")}}>{DAY_LENGTHS.map((length,day)=><div key={day}><strong>{addDays(printWeek,day).toLocaleDateString("en-GB",{weekday:"short"})} {prettyDate(addDays(printWeek,day))}</strong><span>07:00–{timeLabel(START+length)}</span></div>)}</div>
          <div className="print-operators">{operators.map(op=><div key={op.id}><strong>{op.name}</strong></div>)}</div>
          <div className="print-timeline">{operators.map(op=><div className="print-grid-row" key={op.id}><i/><i/><i/></div>)}{DAY_LENGTHS.map((_,i)=><i className="print-day-line" style={{left:`${dayOffset(i)/TOTAL_MINUTES*100}%`}} key={i}/>)}
            {weekJobs.map(job=>{const row=operators.findIndex(o=>o.id===job.operatorId),segment=segmentForWeek(job,printWeekKey),background=job.color||palette[job.category];if(row<0||!segment)return null;return <div className="print-job" key={job.id} style={{left:`${segment.start/TOTAL_MINUTES*100}%`,width:`${segment.duration/TOTAL_MINUTES*100}%`,top:row*24+(job.lane||0)*8,backgroundColor:background,color:contrastText(background)}}><strong>{segment.startsBefore?"← ":""}{job.title}{segment.endsAfter?" →":""}</strong><span>{job.machine}</span></div>;})}
          </div>
        </div>
      </article>})}
      <footer className="print-footer">Generated {new Date().toLocaleDateString("en-GB")} · Working hours: Mon–Thu 07:00–15:45 · Fri 07:00–13:00</footer>
    </section>
    {editor&&<div className="modal-backdrop" onMouseDown={()=>setEditor(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="job-editor" onMouseDown={e=>e.stopPropagation()}><header><div><span>{editor.id?"EDIT SCHEDULED WORK":"NEW PRODUCTION JOB"}</span><h2 id="job-editor">{editor.id?editor.title:"Add a job"}</h2></div><button onClick={()=>setEditor(null)}>×</button></header><div className="form-grid">
      <label className="wide">Works order / job title<input autoFocus value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})} placeholder="WO-00000 · Part description"/></label><label className="wide">Operation description<textarea value={editor.description} onChange={e=>setEditor({...editor,description:e.target.value})} placeholder="Describe the production operation"/></label>
      <label>Operator<select value={editor.operatorId||""} onChange={e=>setEditor({...editor,operatorId:e.target.value||null})}><option value="">Unscheduled</option>{operators.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Working lane<select value={editor.lane} onChange={e=>setEditor({...editor,lane:Number(e.target.value)})}><option value={0}>Lane 1</option><option value={1}>Lane 2</option><option value={2}>Lane 3</option></select></label>
      <label>Machine<input value={editor.machine} onChange={e=>setEditor({...editor,machine:e.target.value})} placeholder="e.g. Mazak QT200"/></label><label>Total estimated hours<input type="number" min="0.25" step="0.25" value={estimatedHoursText} onChange={e=>setEstimatedHoursText(e.target.value)} placeholder="e.g. 8"/><small className="field-help">Finish time is calculated from the start</small></label><label>Priority number<input type="number" min="1" step="1" value={editor.priority||""} onChange={e=>setEditor({...editor,priority:Number(e.target.value)||0})} placeholder="1 = highest"/></label><label>Calculated finish<input value={calculatedEnd?`${calculatedEnd.date} ${calculatedEnd.time}`:"Enter a start and estimated hours"} readOnly/><small className="field-help">Working days and hours only</small></label>
      <fieldset className="date-range wide"><legend>Job start</legend><label>Start date<input type="date" value={startDateText} onChange={e=>setStartDateText(e.target.value)}/></label><label>Start time (HH:MM)<input type="text" inputMode="numeric" value={startText} onChange={e=>setStartText(e.target.value)} placeholder="07:00"/></label></fieldset>
      <fieldset className="date-range wide"><legend>Calculated job finish</legend><label>Finish date<input type="date" value={calculatedEnd?.date||""} readOnly/></label><label>Finish time<input type="text" value={calculatedEnd?.time||""} readOnly/></label></fieldset>
      <label>Quantity<input value={editor.quantity} onChange={e=>setEditor({...editor,quantity:e.target.value})}/></label><label>Due date<input type="date" value={editor.due} onChange={e=>setEditor({...editor,due:e.target.value})}/></label>
      <label>Colour preset<select value={editor.category} onChange={e=>{const category=e.target.value as Category;setEditor({...editor,category,color:palette[category]});}}>{categories.map(c=><option value={c.id} key={c.id}>{c.label}</option>)}</select></label><label>Manual job colour<div className="colour-field"><input type="color" value={editor.color||palette[editor.category]} onChange={e=>setEditor({...editor,color:e.target.value})}/><input value={editor.color||palette[editor.category]} onChange={e=>setEditor({...editor,color:e.target.value})}/></div></label>
    </div><footer>{editor.id?<button className="delete-button" onClick={()=>removeJob(editor.id)}>🗑 Delete job</button>:<span/>}<div><button className="button ghost" onClick={()=>setEditor(null)}>Cancel</button><button className="button primary" onClick={saveEditor}>Save job</button></div></footer></section></div>}
    {contextMenu&&<div className="job-context-menu" style={{left:contextMenu.x,top:contextMenu.y}} onClick={e=>e.stopPropagation()} role="menu">{contextMenu.job&&<><div className="context-job-name">{contextMenu.job.title}</div><button role="menuitem" onClick={()=>copyJob(contextMenu.job!)}>⧉ Copy job</button></>}{contextMenu.target&&<button role="menuitem" disabled={!copiedJob} onClick={()=>copiedJob&&pasteJob(contextMenu.target!)}>▣ {copiedJob?`Paste "${copiedJob.title}" here`:"Copy a job first"}</button>}</div>}
    {confirmation&&<div className="modal-backdrop confirmation-backdrop" onMouseDown={()=>setConfirmation(null)}><section className="modal confirmation-modal" role="alertdialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><header><div><span>CONFIRM ACTION</span><h2>Production Planner</h2></div><button onClick={()=>setConfirmation(null)}>×</button></header><div className="confirmation-body"><p>{confirmation.message}</p></div><footer><span/><div><button className="button ghost" onClick={()=>setConfirmation(null)}>Cancel</button><button className="button primary" onClick={()=>{const action=confirmation.action;setConfirmation(null);action();}}>Confirm</button></div></footer></section></div>}
    {notice&&<div className="toast">✓ {notice}</div>}
  </main>;
}
