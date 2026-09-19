/* slides.html の各ページから、図形・テキスト・アイコン・図版の位置と書式を実測する。
   build-canva.py がヘッドレスChromeに読み込ませて使う。 */
window.addEventListener('load', function(){ setTimeout(function(){
  function isInline(el){
    if(el.tagName==='svg'||el.tagName==='SVG') return true;
    var d=getComputedStyle(el).display;
    return d==='inline'||d==='inline-block'||d==='ruby';
  }

  function textRect(el){
    var tw=document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), nodes=[], n;
    while(n=tw.nextNode()){ if(n.textContent.replace(/\s/g,'')) nodes.push(n); }
    if(!nodes.length) return null;
    var L=1e9,T=1e9,R=-1e9,B=-1e9;
    nodes.forEach(function(nd){
      var rg=document.createRange(); rg.selectNodeContents(nd);
      [...rg.getClientRects()].forEach(function(r){
        if(r.width<0.5||r.height<0.5) return;
        L=Math.min(L,r.left); T=Math.min(T,r.top); R=Math.max(R,r.right); B=Math.max(B,r.bottom);
      });
    });
    return L<1e9?{l:L,t:T,r:R,b:B}:null;
  }
  function runsOf(el){
    var out=[], seenText=false;
    (function walk(n, par){
      for(var c of n.childNodes){
        if(c.nodeType===3){
          var t=c.textContent;
          if(!t.replace(/\s/g,'')) continue;
          var cs=getComputedStyle(par);
          out.push({s:t, c:cs.color, fw:cs.fontWeight, fs:parseFloat(cs.fontSize)});
          seenText=true;
        } else if(c.nodeType===1 && (c.tagName==='svg'||c.tagName==='SVG') && c.classList.contains('ic')){
          // 行頭のアイコンはテキスト枠の開始位置でよけているので、途中のものだけ空きを入れる
          if(seenText){
            var iw=c.getBoundingClientRect().width;
            var fs=parseFloat(getComputedStyle(par).fontSize)||16;
            var pad='　'.repeat(Math.max(1, Math.round(iw/fs)));
            out.push({s:pad, c:getComputedStyle(par).color, fw:'400', fs:fs, pad:true});
          }
        } else if(c.nodeType===1 && c.tagName==='BR'){
          out.push({br:true});
        } else if(c.nodeType===1 && c.tagName!=='svg' && c.tagName!=='SVG'){
          walk(c, c);
        }
      }
    })(el, el);
    return out;
  }
  var slides=[...document.querySelectorAll('section.slide')];
  var pages=slides.map(function(s,i){
    var b=s.getBoundingClientRect(); var items=[];
    s.querySelectorAll('*').forEach(function(el){
      var r=el.getBoundingClientRect();
      if(r.width<2||r.height<2) return;
      var cs=getComputedStyle(el);
      var bg=cs.backgroundColor, hasBg=bg&&bg!=='rgba(0, 0, 0, 0)';
      var bw=parseFloat(cs.borderTopWidth)||0;
      var isImg=el.tagName==='IMG';
      var isIcon=(el.tagName==='svg'||el.tagName==='SVG')&&el.classList.contains('ic');
      var base={t:+(r.top-b.top).toFixed(1),l:+(r.left-b.left).toFixed(1),
                w:+r.width.toFixed(1),h:+r.height.toFixed(1)};
      if(isImg){ items.push(Object.assign({k:'img',src:el.getAttribute('src'),
        nw:el.naturalWidth,nh:el.naturalHeight,fit:cs.objectFit,pos:cs.objectPosition},base)); return; }
      if(isIcon){ var u=el.querySelector('use');
        items.push(Object.assign({k:'icon',ref:u?u.getAttribute('href'):null,col:cs.color},base)); return; }
      if(hasBg||bw){ items.push(Object.assign({k:'box',bg:bg,rad:cs.borderTopLeftRadius,
        br:bw?cs.borderTopColor:null,bwd:bw,cls:(el.className||'').toString().slice(0,32)},base)); }
      // テキストの塊か判定：中に非インラインの子要素がないこと
      if(cs.display==='inline') return;   // <b> や素の <span> は親のランとして拾う
      var txt=el.textContent.replace(/\s/g,'');
      if(!txt) return;
      var kids=[...el.children].filter(function(c){return !isInline(c);});
      if(kids.length){
        // ブロックの子と、地のテキスト／インライン要素が混在する場合。
        // 連続するインラインの並びを1つの塊としてまとめて拾う。
        var group=[];
        function flush(){
          if(!group.length){ return; }
          var L=1e9,T=1e9,R=-1e9,B=-1e9, runs=[];
          group.forEach(function(nd){
            if(nd.nodeType===3){
              var rg=document.createRange(); rg.selectNodeContents(nd);
              [...rg.getClientRects()].forEach(function(q){
                if(q.width<0.5||q.height<0.5) return;
                L=Math.min(L,q.left); T=Math.min(T,q.top); R=Math.max(R,q.right); B=Math.max(B,q.bottom); });
              runs.push({s:nd.textContent, c:cs.color, fw:cs.fontWeight, fs:parseFloat(cs.fontSize)});
            } else {
              var q2=nd.getBoundingClientRect();
              if(q2.width>0.5&&q2.height>0.5){
                L=Math.min(L,q2.left); T=Math.min(T,q2.top); R=Math.max(R,q2.right); B=Math.max(B,q2.bottom); }
              runsOf(nd).forEach(function(rr){ runs.push(rr); });
            }
          });
          group=[];
          if(L<1e9 && runs.length) items.push({k:'text',align:cs.textAlign,lh:cs.lineHeight,
            fs:parseFloat(cs.fontSize),ls:cs.letterSpacing,runs:runs,
            t:+(T-b.top).toFixed(1), l:+(L-b.left).toFixed(1),
            w:+(R-L).toFixed(1), h:+(B-T).toFixed(1)});
        }
        [...el.childNodes].forEach(function(n2){
          if(n2.nodeType===3){
            if(n2.textContent.replace(/\s/g,'')) group.push(n2);
          } else if(n2.nodeType===1 && isInline(n2) && n2.tagName!=='svg' && n2.tagName!=='SVG'){
            group.push(n2);
          } else { flush(); }
        });
        flush();
        return;
      }
      // 行頭にアイコンがある塊だけ、文字の開始位置から枠を取る。
      // それ以外は要素の幅をそのまま使う（中央寄せの折り返しを合わせるため）
      var lead=null;
      for(var cn of el.childNodes){
        if(cn.nodeType===3 && !cn.textContent.replace(/\s/g,'')) continue;
        lead=cn; break;
      }
      var hasLeadIcon = lead && lead.nodeType===1 &&
                        (lead.tagName==='svg'||lead.tagName==='SVG') && lead.classList.contains('ic');
      var tb=Object.assign({},base);
      if(hasLeadIcon){
        var tr=textRect(el);
        if(tr){ tb.l=+(tr.l-b.left).toFixed(1); tb.w=+(r.right-tr.l).toFixed(1); }
      }
      items.push(Object.assign({k:'text',align:cs.textAlign,lh:cs.lineHeight,
        fs:parseFloat(cs.fontSize),ls:cs.letterSpacing,runs:runsOf(el)},tb));
    });
    // .lead b の黄色いマーカー（inset影なので背景としては拾えない）
    s.querySelectorAll('.lead b').forEach(function(el){
      var r=el.getBoundingClientRect();
      if(r.width<2) return;
      items.push({k:'hl',t:+(r.top-b.top).toFixed(1),l:+(r.left-b.left).toFixed(1),
                  w:+r.width.toFixed(1),h:+r.height.toFixed(1)});
    });
    return {p:i+1, items:items};
  });
  document.getElementById('__out').textContent='###JSON###'+JSON.stringify({pages:pages})+'###END###';
},1800);});
