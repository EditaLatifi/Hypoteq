/* HYPOTEQ Website – Designvorschau: Interaktionen & Animationen */
(function(){
  var d=document,w=window;
  var fmt=function(n){return "CHF "+Math.round(n).toLocaleString("de-CH").replace(/,/g,"’")};
  var pct=function(n){return (n*100).toFixed(1).replace(".",d.documentElement.lang.indexOf("de")===0||d.documentElement.lang.indexOf("en")===0?".":",")+" %"};

  /* Scroll progress, sticky nav, sticky mobile CTA */
  var nav=d.querySelector(".site-nav"),prog=d.querySelector(".progress"),sticky=d.querySelector(".sticky-cta");
  function onScroll(){
    var y=w.scrollY,h=d.documentElement.scrollHeight-w.innerHeight;
    if(prog)prog.style.width=(h>0?y/h*100:0)+"%";
    if(nav)nav.classList.toggle("scrolled",y>20);
    if(sticky)sticky.classList.toggle("show",y>500);
  }
  w.addEventListener("scroll",onScroll,{passive:true});onScroll();

  /* Mobile menu + dropdowns */
  var mb=d.querySelector(".menu-btn");
  if(mb)mb.addEventListener("click",function(){var o=nav.classList.toggle("open");mb.setAttribute("aria-expanded",o);mb.textContent=o?"×":"☰"});
  d.querySelectorAll(".main-nav .item>button").forEach(function(b){
    b.addEventListener("click",function(e){
      var it=b.parentNode,o=!it.classList.contains("open");
      d.querySelectorAll(".main-nav .item.open").forEach(function(x){if(x!==it)x.classList.remove("open")});
      it.classList.toggle("open",o);b.setAttribute("aria-expanded",o);e.stopPropagation();
    });
  });
  d.addEventListener("click",function(e){if(!e.target.closest(".main-nav"))d.querySelectorAll(".main-nav .item.open").forEach(function(x){x.classList.remove("open")})});
  d.addEventListener("keydown",function(e){if(e.key==="Escape")d.querySelectorAll(".main-nav .item.open").forEach(function(x){x.classList.remove("open")})});

  /* Reveal + counters + bars */
  function count(el){
    var raw=el.getAttribute("data-count"),m=raw.match(/^([^\d]*)(\d[\d’']*(?:\.\d+)?)(.*)$/);
    if(!m){return}
    var target=parseFloat(m[2].replace(/[’']/g,"")),dec=(m[2].split(".")[1]||"").length,t0=null,dur=1400;
    if(isNaN(target)||target===0){return}
    function step(t){if(!t0)t0=t;var p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3),v=target*e;
      el.textContent=m[1]+(dec?v.toFixed(dec):Math.round(v).toLocaleString("de-CH").replace(/,/g,"’"))+m[3];
      if(p<1)requestAnimationFrame(step);}
    requestAnimationFrame(step);
  }
  if("IntersectionObserver" in w){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){
      if(!e.isIntersecting)return;var t=e.target;t.classList.add("in");
      if(t.hasAttribute("data-count"))count(t);
      io.unobserve(t);
    })},{threshold:.15,rootMargin:"0px 0px -40px 0px"});
    d.querySelectorAll(".rv,[data-count],.rate,.step-list article").forEach(function(el){io.observe(el)});
  }else{d.querySelectorAll(".rv,.rate,.step-list article").forEach(function(el){el.classList.add("in")})}

  /* Calculators */
  d.querySelectorAll("[data-calc]:not([data-calc=hq])").forEach(function(box){
    var mode=box.getAttribute("data-calc"),f=box.querySelector("form"),T=JSON.parse(box.getAttribute("data-t")||"{}");
    var q=function(s){return box.querySelector(s)};
    var segs=box.querySelectorAll(".seg button");
    segs.forEach(function(b){b.addEventListener("click",function(e){e.preventDefault();segs.forEach(function(x){x.classList.remove("on")});b.classList.add("on");run()})});
    function val(id){var el=q("[name="+id+"]");return el?Math.max(0,parseFloat(el.value)||0):0}
    function run(){
      var P=val("price"),E=val("equity"),I=val("income"),H=Math.max(0,P-E);
      var second=d.querySelector&&box.querySelector(".seg button.on[data-v=second]");
      if(mode==="zins"){
        var r=parseFloat(q("[name=rate]").value)/100;
        q("[data-o=main]").textContent=fmt(H*r/12);
        q("[data-o=loan]").textContent=fmt(H);
        q("[data-o=ltv]").textContent=P?pct(H/P):"–";
        q("[data-o=year]").textContent=fmt(H*r);
      }else{
        var maxLtv=second?0.75:0.8;
        var ltv=P?H/P:0;
        var amort=Math.max(0,H-P*0.6667)/15;
        var cost=H*0.05+P*0.01+amort;
        var aff=I?cost/I:0;
        var g=q(".gauge i");g.style.width=Math.min(100,aff/0.5*100)+"%";g.classList.toggle("warn",aff>0.3334);
        q("[data-o=main]").textContent=I?pct(aff):"–";
        q("[data-o=loan]").textContent=fmt(H);
        q("[data-o=ltv]").textContent=P?pct(ltv):"–";
        q("[data-o=cost]").textContent=fmt(cost/12);
        var maxP=I?(0.3333*I)/(0.05*0.8+0.01+Math.max(0,0.8-0.6667)/15):0;
        q("[data-o=maxp]").textContent=fmt(maxP);
        var v=q(".verdict");
        if(!P||!I){v.textContent=T.empty||"";}
        else if(E/P<(second?0.25:0.2)){v.textContent=T.equity||"";}
        else if(aff>0.3334){v.textContent=T.over||"";}
        else{v.textContent=T.ok||"";}
      }
    }
    f.addEventListener("input",run);f.addEventListener("submit",function(e){e.preventDefault()});run();
  });

  /* HYPOTEQ-Rechner: Felder & Logik wie hypoteq.com/de/hypothekenrechner */
  d.querySelectorAll('[data-calc="hq"]').forEach(function(box){
    var T=JSON.parse(box.getAttribute("data-t")||"{}"),f=box.querySelector("form");
    var st={mode:"purchase",res:"haupt"};
    var chf=function(n){return "CHF "+Math.round(n).toLocaleString("de-CH").replace(/,/g,"’")};
    var pc=function(x){return (100*x).toFixed(1).replace(".",",")+"%"};
    var num=function(v){return Number(String(v).replace(/[^0-9]/g,""))||0};
    function get(n){return num(f.querySelector('[name='+n+']').value)}
    function set(n,v){var i=f.querySelector('[name='+n+']'),r=f.querySelector('[name='+n+'_r]');i.value=Math.round(v).toLocaleString("de-CH").replace(/,/g,"’");if(r)r.value=v}
    function minLabel(n,v){var el=f.querySelector('[data-f='+n+'] .hq-min');if(el)el.textContent=v>0?(T.min+": "+Math.round(v).toLocaleString("de-CH").replace(/,/g,"’")+" CHF"):""}
    box.querySelectorAll(".seg button").forEach(function(b){b.addEventListener("click",function(){
      var seg=b.parentNode;seg.querySelectorAll("button").forEach(function(x){x.classList.remove("on")});b.classList.add("on");
      if(seg.classList.contains("mode"))st.mode=b.getAttribute("data-v");else st.res=b.getAttribute("data-v");run(true)})});
    f.addEventListener("input",function(e){var t=e.target;if(t.type==="range"){var n=t.name.replace("_r","");var v=Number(t.value);if(n==="price")v=5e3*Math.round(v/5e3);set(n,v)}else if(t.name&&t.name!=="rate"){var v2=num(t.value);var r=f.querySelector('[name='+t.name+'_r]');if(r)r.value=v2;t.value=v2?v2.toLocaleString("de-CH").replace(/[,'\u2019]/g,"’"):""}run(false)});
    f.addEventListener("change",function(e){if(e.target.name&&e.target.name!=="rate")run(true)});
    f.addEventListener("submit",function(e){e.preventDefault()});
    function run(clamp){
      var haupt=st.res==="haupt",buy=st.mode==="purchase";
      box.classList.toggle("is-refi",!buy);
      var cfg=haupt?{maxB:.8,first:.6667,maint:.008,years:15}:{maxB:.65,first:0,maint:.008,years:0};
      var R=parseFloat(f.querySelector("[name=rate]").value)/100;
      var a=get("price"),h=get("own"),g=get("income"),j=get("existing"),v=get("increase");
      // Mindest-Eigenmittel (Kauf): 20 % Haupt-, 35 % Zweitwohnsitz
      var O=buy?a*(haupt?.2:.35):0;
      if(buy&&clamp&&h<O){h=O;set("own",h)}
      f.querySelector("[name=own_r]").max=Math.max(a,1);f.querySelector("[name=existing_r]").max=Math.max(a,1);f.querySelector("[name=increase_r]").max=Math.max(cfg.maxB*a,1);
      var S=Math.max(0,a-h),L=Math.max(0,j+v),E=buy?S:L;
      var W=a>0?E/a:0,B=haupt?cfg.first*a:0,P=haupt?Math.max(0,E-B):0;
      var D=haupt?E*(.058+(.8-.6667)/15):.058*E;
      var V=D>0?Math.ceil(D/.35):0;
      if(clamp&&g<V){g=V;set("income",g)}
      var Tq=g>0?D/g:0,H=g>0&&Tq<=.35;
      var q=!buy||(a>0&&h>=O);
      var I=W<=(haupt?.8:.65)&&H&&q;
      var J=a>0?L/a:0,K=a*cfg.maint/12;
      var Q=haupt?Math.max(0,j-B):0,U=haupt&&cfg.years>0?Math.max(0,Q/cfg.years):0;
      var X=j*R,Z=a*cfg.maint,ee=E*R/12,et=(haupt&&cfg.years>0?Math.max(0,P/cfg.years):0)/12,ea=ee+K+et;
      minLabel("own",buy?O:0);minLabel("income",V);
      box.querySelector(".hq-title").textContent=I?(buy?T.okP:T.okR):T.no;
      box.querySelector("[data-o=main]").textContent=chf(E);
      box.querySelector(".hq-head").classList.toggle("bad",!I);
      var ta=box.querySelector('[data-t=a]'),tb=box.querySelector('[data-t=b]');
      if(buy){ta.querySelector("span").textContent=T.own;ta.querySelector("small").textContent=haupt?"(min. 20%)":"(min. 35%)";ta.querySelector("b").textContent=pc(a>0?h/a:0);ta.classList.toggle("bad",a>0&&h<O)}
      else{ta.querySelector("span").textContent=T.ltv;ta.querySelector("small").textContent="";ta.querySelector("b").textContent=pc(J);ta.classList.remove("bad")}
      tb.querySelector("span").textContent=T.aff;tb.querySelector("small").textContent="(max. 35%)";tb.querySelector("b").textContent=pc(Tq);tb.classList.toggle("bad",!H);
      var sm=buy?[[T.amort,et],[T.side,K],[T.icost,ee],[T.monthly,ea]]:[[T.prev,(X+Z+U)/12],[T.total,ea],[T.interest,ee],[T.maint,K]];
      var hl=buy?3:1;
      box.querySelectorAll(".hq-small").forEach(function(el,i){el.querySelector("span").textContent=sm[i][0];el.querySelector("b").textContent=chf(sm[i][1]);el.classList.toggle("hl",i===hl)});
    }
    ["price","existing","increase","own","income"].forEach(function(n){set(n,get(n))});
    run(true);
  });


  /* Hero: Kantonshauptorte wechseln */
  d.querySelectorAll(".city[data-cities]").forEach(function(el){
    var list=JSON.parse(el.getAttribute("data-cities")||"[]"),i=0;
    if(list.length<2||(w.matchMedia&&w.matchMedia("(prefers-reduced-motion: reduce)").matches))return;
    setInterval(function(){el.classList.add("out");setTimeout(function(){i=(i+1)%list.length;el.textContent=list[i];el.classList.remove("out")},350)},2200);
  });
  /* TOC highlight */
  var toc=d.querySelectorAll(".toc a");
  if(toc.length&&"IntersectionObserver" in w){
    var map={};toc.forEach(function(a){map[a.getAttribute("href").slice(1)]=a});
    var tio=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){toc.forEach(function(a){a.classList.remove("on")});var a=map[e.target.id];if(a)a.classList.add("on")}})},{rootMargin:"-30% 0px -60% 0px"});
    d.querySelectorAll(".prose h2[id]").forEach(function(h){tio.observe(h)});
  }

  /* Demo forms: never send data */
  d.querySelectorAll("form[data-demo]").forEach(function(f){
    f.addEventListener("submit",function(e){e.preventDefault();var ok=f.querySelector(".form-ok");if(ok)ok.classList.add("show");f.querySelectorAll("input,textarea,select").forEach(function(i){i.blur()})});
  });
})();
