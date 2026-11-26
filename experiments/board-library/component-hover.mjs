// Mouse-only delayed hint. Selection and touch handling remain independent.
export function createComponentHover({resolve,show,hide,schedule=setTimeout,cancel=clearTimeout,delay=380}){
 let timer=null,point=null,anchor=null,shown=false;
 function clear(){if(timer!==null)cancel(timer);timer=null;point=null;anchor=null;shown=false;hide();}
 function arm(next){point=next;anchor=next;timer=schedule(()=>{timer=null;const component=resolve(point);if(component){shown=component.id;show(component,point);}},delay);}
 return {clear,move(e){
  if(e.pointerType!=='mouse'||e.buttons){clear();return;}
  if(point&&e.clientX===point.x&&e.clientY===point.y)return;
  const next={x:e.clientX,y:e.clientY};
  // Small hand tremors must not indefinitely restart the dwell timer. Recheck
  // the nearest physical surface even within the tolerance (small adjacent parts).
  if(point&&anchor&&Math.hypot(next.x-anchor.x,next.y-anchor.y)<=5){
   point=next;if(shown){const c=resolve(point);if(c&&c.id===shown)show(c,point);else {clear();if(c)arm(next);}}return;
  }
  clear();arm(next);
 }};
}
