import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Plus, LogIn, UserPlus, Send, LogOut, Copy } from 'lucide-react';

type User={id:number;name:string;handle:string};
type Chat={id:number;title:string;code:string;created_at:string;last_body:string|null;last_at:string|null;member_count:number};
type Message={id:number;body:string;created_at:string;sender_id:number;sender_name:string;sender_handle:string};

const API='/api';
const auth=()=>localStorage.getItem('hamgap_token')||'';
async function api(path:string,options:RequestInit={}) {
  const headers=new Headers(options.headers);
  headers.set('Content-Type','application/json');
  const token=auth(); if(token) headers.set('Authorization',`Bearer ${token}`);
  const r=await fetch(API+path,{...options,headers});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||'خطایی رخ داد.');
  return data;
}
function time(v:string){return new Date(v.replace(' ','T')+'Z').toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})}

export default function App(){
 const [user,setUser]=useState<User|null>(null),[chats,setChats]=useState<Chat[]>([]),[selected,setSelected]=useState<Chat|null>(null);
 const [messages,setMessages]=useState<Message[]>([]),[text,setText]=useState(''),[mode,setMode]=useState<'login'|'register'>('login');
 const [handle,setHandle]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[code,setCode]=useState('');
 const [chatTitle,setChatTitle]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [joinOpen,setJoinOpen]=useState(false),[createOpen,setCreateOpen]=useState(false);

 const loadChats=async()=>{const d=await api('/chats');setChats(d.chats)};
 const loadMessages=async(id:number)=>{const d=await api(`/chats/${id}/messages`);setMessages(d.messages)};

 useEffect(()=>{if(auth()) api('/me').then((d)=>setUser(d.user)).catch(()=>localStorage.removeItem('hamgap_token'))},[]);
 useEffect(()=>{if(user) loadChats().catch(e=>setError(e.message))},[user]);
 useEffect(()=>{if(selected) loadMessages(selected.id).catch(e=>setError(e.message))},[selected]);

 const submitAuth=async(e:React.FormEvent)=>{
  e.preventDefault();setBusy(true);setError('');
  try{
   const d=await api(mode==='login'?'/auth/login':'/auth/register',{method:'POST',body:JSON.stringify(mode==='login'?{handle,password}:{name,handle,password})});
   localStorage.setItem('hamgap_token',d.token);setUser(d.user);
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 };
 const createChat=async(e:React.FormEvent)=>{
  e.preventDefault();setBusy(true);try{const d=await api('/chats',{method:'POST',body:JSON.stringify({title:chatTitle})});setChats([d.chat,...chats]);setSelected(d.chat);setCreateOpen(false);setChatTitle('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 };
 const joinChat=async(e:React.FormEvent)=>{
  e.preventDefault();setBusy(true);try{const d=await api('/chats/join',{method:'POST',body:JSON.stringify({code})});await loadChats();setSelected(d.chat);setJoinOpen(false);setCode('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 };
 const send=async(e:React.FormEvent)=>{
  e.preventDefault();if(!selected||!text.trim())return;const body=text.trim();setText('');
  try{const d=await api(`/chats/${selected.id}/messages`,{method:'POST',body:JSON.stringify({body})});setMessages(m=>[...m,d.message]);loadChats()}catch(e){setError((e as Error).message)}
 };
 const logout=()=>{localStorage.removeItem('hamgap_token');setUser(null);setSelected(null);setMessages([])};
 const sorted=useMemo(()=>chats,[chats]);

 if(!user) return <main className="min-h-screen grid place-items-center bg-slate-100 p-4" dir="rtl">
  <form onSubmit={submitAuth} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl">
   <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-sky-500 text-white"><MessageCircle size={32}/></div>
   <h1 className="text-2xl font-black text-center">هم‌گپ</h1><p className="mt-2 text-center text-sm text-slate-500">{mode==='login'?'وارد حساب خود شوید':'حساب تازه بسازید'}</p>
   {mode==='register'&&<input className="mt-5 w-full rounded-xl bg-slate-100 p-3 outline-none" placeholder="نام" value={name} onChange={e=>setName(e.target.value)}/>}
   <input className="mt-3 w-full rounded-xl bg-slate-100 p-3 outline-none" dir="ltr" placeholder="نام کاربری" value={handle} onChange={e=>setHandle(e.target.value)}/>
   <input className="mt-3 w-full rounded-xl bg-slate-100 p-3 outline-none" dir="ltr" type="password" placeholder="رمز ورود" value={password} onChange={e=>setPassword(e.target.value)}/>
   {error&&<p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}
   <button disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 p-3 font-bold text-white">{mode==='login'?<LogIn size={18}/>:<UserPlus size={18}/>} {busy?'لطفاً صبر کنید…':mode==='login'?'ورود':'ثبت‌نام'}</button>
   <button type="button" onClick={()=>{setMode(mode==='login'?'register':'login');setError('')}} className="mt-4 w-full text-sm font-bold text-sky-600">{mode==='login'?'حساب ندارید؟ ثبت‌نام کنید':'قبلاً حساب ساخته‌اید؟ ورود'}</button>
  </form>
 </main>;

 return <main dir="rtl" className="flex h-screen bg-slate-50 text-slate-800">
  <aside className="flex w-80 shrink-0 flex-col border-l bg-white">
   <header className="flex items-center gap-3 border-b p-4"><div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500 text-white"><MessageCircle/></div><div className="min-w-0 flex-1"><b className="block truncate">{user.name}</b><span dir="ltr" className="block text-xs text-slate-400">@{user.handle}</span></div><button onClick={logout} className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><LogOut size={18}/></button></header>
   <div className="flex gap-2 p-3"><button onClick={()=>setCreateOpen(true)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-sky-500 p-2 text-sm font-bold text-white"><Plus size={17}/> گفت‌وگوی تازه</button><button onClick={()=>setJoinOpen(true)} className="rounded-xl border px-3 text-sm font-bold">پیوستن</button></div>
   <div className="flex-1 overflow-auto">{sorted.map(c=><button key={c.id} onClick={()=>setSelected(c)} className={'w-full border-b p-4 text-right hover:bg-slate-50 '+(selected?.id===c.id?'bg-sky-50':'')}><b className="block truncate">{c.title}</b><span className="mt-1 block truncate text-xs text-slate-400">{c.last_body||'هنوز پیامی نیست'}</span></button>)}</div>
  </aside>
  <section className="flex min-w-0 flex-1 flex-col">
   {selected?<><header className="border-b bg-white p-4"><b>{selected.title}</b><span className="mr-3 text-xs text-emerald-600">{selected.member_count} عضو</span><button onClick={()=>navigator.clipboard?.writeText(selected.code)} className="float-left flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs"><Copy size={14}/>{selected.code}</button></header>
   <div className="flex-1 overflow-auto p-5"><div className="mx-auto max-w-3xl space-y-3">{messages.map(m=><div key={m.id} className={'flex '+(m.sender_id===user.id?'justify-start':'justify-end')}><div className={'max-w-[75%] rounded-2xl px-4 py-2 '+(m.sender_id===user.id?'bg-sky-500 text-white':'bg-white shadow-sm')}><b className="block text-xs opacity-70">{m.sender_name}</b><div className="whitespace-pre-wrap break-words">{m.body}</div><small className="mt-1 block text-left opacity-60">{time(m.created_at)}</small></div></div>)}</div></div>
   <form onSubmit={send} className="flex gap-2 border-t bg-white p-3"><input value={text} onChange={e=>setText(e.target.value)} className="flex-1 rounded-xl bg-slate-100 p-3 outline-none" placeholder="پیامی بنویسید…"/><button className="grid h-12 w-12 place-items-center rounded-xl bg-sky-500 text-white"><Send size={20}/></button></form></>
   :<div className="grid flex-1 place-items-center text-center"><div><MessageCircle className="mx-auto text-sky-400" size={60}/><h2 className="mt-3 text-xl font-black">به هم‌گپ خوش آمدی</h2><p className="mt-2 text-sm text-slate-500">یک گفت‌وگو بساز یا با کد دعوت وارد شو.</p></div></div>}
  </section>
  {(createOpen||joinOpen)&&<div className="fixed inset-0 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={createOpen?createChat:joinChat} className="w-full max-w-sm rounded-3xl bg-white p-6"><h2 className="text-xl font-black">{createOpen?'گفت‌وگوی تازه':'پیوستن با کد'}</h2><input autoFocus value={createOpen?chatTitle:code} onChange={e=>createOpen?setChatTitle(e.target.value):setCode(e.target.value.replace(/\D/g,'').slice(0,6))} className="mt-4 w-full rounded-xl bg-slate-100 p-3 outline-none" placeholder={createOpen?'نام گفت‌وگو':'کد شش‌رقمی'}/>{error&&<p className="mt-3 text-sm text-rose-600">{error}</p>}<button className="mt-4 w-full rounded-xl bg-sky-500 p-3 font-bold text-white">{createOpen?'ساخت':'پیوستن'}</button><button type="button" onClick={()=>{setCreateOpen(false);setJoinOpen(false);setError('')}} className="mt-2 w-full p-2 text-sm">انصراف</button></form></div>}
 </main>;
}
