//
//                          WELCOME TO THE BENO LOADER v 3.2 Horse meat edition PLUS!
//
//                          THIS CODE IS COPYRIGHT (C) BENO. ALL RIGHTS RESERVED. (exept where it says otherwise)
//
//                          This version is an update of v 3.1 Horse meat edition, which was an update of 3.0 Cow farm.
//
//                          This version includes compatibility mode for games using the v 2.0/2.1 Cow pat loader
//
//                          Other improvements include... compatibility with most browsers (including idoit explorer!!!! wow that is amazing!!!!), 
//

////////////////////////////////////////////
//MOBILE MODE
mobilemode = "none" // gets overridden in game
inmobileview = false // becomes true when entering mobile mode
fullScreenViewMode = false // goes true when fullscreen







///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
gamego = false; // firstly, disable mouse and keyboard inputs until the game has loaded
isIE = ((navigator.userAgent.indexOf("MSIE") != -1) || (navigator.appVersion.indexOf('Trident/') > 0))  // CHECK FOR IDIOT EXPLORER
window.oncontextmenu = function (){return false}  // disable right click. I am NOT doing this to be nasty - I am doing it as users keep right clicking by accident, and mucking up the game.
function beno_game_system_start(){  // the first ever function from body onload
loaderqqcurrentURL = window.location;
loadertttttt = loaderqqcurrentURL.href
if(loadertttttt.indexOf('?') == -1){  // if there is a question mark in the url put loader into debug mode
loaderdebugggy = false
}else{
loaderdebugggy = true
}
if ((loadertttttt.indexOf('aaa') == -1) && (loadertttttt.indexOf('localhost') == -1)){
framenumber = 14  // Start the animation of the logo at frame 14 when online
}else{
framenumber = 64  // Start the animation of the logo at frame 64 when local
}
canvas = document.getElementById("canvas")
ctx = canvas.getContext("2d")
ctx.textAlign = "center"
ctx.textBaseline = "middle"
thetimer = 0 //  this is used to timeout if it reaches 1000
buggystart = 1000000000  // used for a delay starting when in debug mode
gamecanstartyayyay = true;  // this will be disabled later to stop 2 games running at the same time
gjfdopigjfidpgjpdfgjpsd = false  // a test to see if the browser can load the sound!
puiokppohkopkopjkojkpkj = 1  // number of attempts to run sound
hdfuiodsghosfdghfuidosghudo = new Audio()  // BENO logo music, this is used to test HTML5 audio
hdfuiodsghosfdghfuidosghudo.addEventListener('canplaythrough', function(){gjfdopigjfidpgjpdfgjpsd = true})
try{
hdfuiodsghosfdghfuidosghudo.src = "data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAA+AAAk3wACBwcLEBATExgcHCAkJCgoLTAwNTg4PT1ARUVJSU1RUVZaWl9fY2dna3BwdHR4fHyAhISJiYyRkZWVmZ2doaWlqamtsbG1ubm+vsLGxsrKztLS1tvb39/j5+fs8PD09Pj9/f8AAAAKTEFNRTMuOThyBF8AAAAAAAAAABQgJAVgQQABmgAAJN8ynM3oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQxAAAASABl9QAACEBBGw/NAABDwAAAAAAAACXVmRGVWVVZ3iH/+2toAAAAFkLJhSARADCP1t5Y8vyKtvXfo7t66diTOB7QCQhdjJN+zSDWyXAHaZ+4G/P069vfpUCVUZlZom1tbD/+zDEBIAJQOVZ/YGAKO0Qa72GDEwlgwkWk86McDVd8yopTIrl7vfDq5x6sXyPhZH0bDe8KeshG/w4ZrK5IFRDnRtSWqrthKmndiyU22yMNxIK33Pj1iZVV2d4n/eRgBcww8vUpmGVXXBkB0AQ2QuqZF22F1s3f+ohE0P/XLUMxnviGrWmILpiYHiVdxF+tsUFFQZlRVZni22NMAX/+zDEBQAHlB1b6DzAaPqFK/2EmF0EE9TAL6PZEEGhZwZwjZo/OKRdU9tb1/1J/bMUl+qBbnm2/Xm//1dPvr7/ap2cUR/tNLArMzvEQ+3+0gDOiqVHBBGGxAGGOwaGhgm4tk9O97vz+3ey/xtntbIpf4H0XvnU7p1F9pIe2FsBr9ec3vv29dUBd3Z3mZ/31oAYcVTpYQGLBQYRDGn/+zDECoAIjHth7DBjaQyUrD2DDRSoS/TRlB8ABj4eMGK1hjiOZkamXdD15nrk8CF0uVr5vCkYdlp/qIP+sest/+pwJ6APDsisq7f7RgLDFVKMETTMeByrjQaihC4DFr4m+f5/9byrRn+bpCTy4biJy5FUpEZWS5kSCA6fap6m3VyYoGzx8PaFAHhXR2ePvrbQFhiqcoJNkxHgYs//+yDECgAIIGVj7CRI4PQIq/2EjRQT5Vmaeo4ZYXdHLMmzEbLe/IqzyYNAq+8w6njyVrzFiVLUOCahcYggFHJaMWgAVldTdo+1jSAROIYlKJKREjiomZNWiQN9o5GzF2DByUV2d4KqWuYwgYuTEbjwooai5hgrfaq37qtS1rQXAbya//swxAGABvQnXaxlIODvB+w9l4xk9nl0iACCYR1H0IylhUc54mKu0P/EjfdbbECxHQWqWrDhLCSFFnGXjWH2vlizXPDNKYlqf3ABIxuzvH20rgCx0/SMSqREpTEwUZ7pfF5VUCFmLhfFYRkw0+EzT0NnXNas+kVQ+m644iHJ+Jiav7Ji0qoQRkNGd43/2oATnR5J6aVZE1fLABMb//sgxAsAh5QjZewkZmjeBWx9l5hcF6HdMfY2WWkzepPZNkP9xWyjWtm63369Gc+899dHbdhznd1rnJx4gjGyQ8NWAEb0wSkysKg3x/EAQa7R0ofVOgdtJCMDERZKVng4xlwKqmg2ZsJQkEhhBUa9fVPO9VUQZ0Vpqq3/1gAVXXCU9v/7MMQHAIfMP2XsPSRhDgesvYSNHWkYFpkqURHpkSKmkWaO4YQmta+TSXpKhSNCFjSxnPnnFWiinAGLklgq5attm5/igoQO6HE1M+wAueWYKeTSLKW7gMDalQjirKgnkhcYQjqqEtEwHDULOZnu1ibbfZHqZP3krX288x+TP7sm1J7r+67i+/fQA+ic/2//1oD+oMEbkoLUGyaBgv/7IMQJgAf0KWOsvSKo+A+sNZMJXFrKO2et9m+xwdlOGO77/Pn95zxjikn//1jV4xZPGG/s66F3NX1/eWf/RX+ooRZE597v7YwE7jDaKbIghssLFG4tCoJD4YvmjujBvx4lKtt35GKUp7K7Gk5uM5zHx6RAYMvZYLt94QfYte5FA03/+zDEAQAIEEdjrIRuoQwMrLWTCV1k8v318gDVAqgTsVBI5YWBGYt89UVmJ3dirrbJg1TexQZCFF0gnkCaHLfW1azLWDD4nKAQuPaVAnOJ1Uh80MAj+j/2/21oDdgqkTgaS6iMsemNNUqxCeMdBx5kNDYxbu8Xd2YyvomwSJn//1/ZDpnX8M6JiXcdQ+5+GnuPLM9Ou7XVAT2Yce3/+zDEAoAH4JVhrLxE4N6IbHWUiQx+zYDGjBoJ4KFSVCoCrOAwHaI3I6jR0pR7+sr0Ox2UnPPfqyuEax2qh2RmjCguCobwvGkRjeYV6nvsAduicl/3zgC2AvQUgxNIKNuottvKAXWecZBDR0e9/tGRQvUrQjpUFS5UqADqgPoWDRkp6veofGIC2aqP//+ygU4MiIqY6LFyEYAVDBf/+yDECoAHqE9lrLBFIPqEbHWcMBQjYjKT8G4PHv2QlkLZ3i0sE9yC5thEwsYthoWCIhcV6SxByErVr4rmgJV2nvvvraBHTAuH0txVjeVfjDRg0fFToEcD5ATCRCSDwyhIkelVCClhZtAgFn2mQQpXZl5U7HJkQxYkVDovB9Vbk//t//swxAMAB8A7Y6ywZuDWi+x1kwkcrgERMLAatVVaWPAqWP6GDTxSixH6Dg1LLKxhYjEAhKEygEMCjAGJ1fKgopaBZD73JNL1enolAKoKUua9y/7AATphZDVpeVcDVk1Kz2XFircOaFNmIwyNa/Pf2a2wsY+cWKtF1GZA/QiNjnh9CmoKQtT6b/TSgYGN8LRBgyajJFqNKG0BudIO//sgxAyAB5wvYazhgKEQGyy1lI0c2hc7mFvRrBFUTFA0AVwCwaJyylbFs9NiSbHDnNR89jxp4mRaIpEf5//99ALgEokAAJSgjDeLDNAqE+j99yFUSLbvEj2+anapuRXpoXO5Q/5mnzv/fNz7maTs4vzvZ0/YiYZhFohAOlMMJkKOS//7MMQCgAdUJ2Gs4WCg/QZs9ZYkjP2uAPEYnBEYxFSwmISw4LWNaZH+15WPIFU0Iphss4LGrzIkL4dPUnXSzDigQaFZt/z19IqVWKn05rr//8AIKBjQaMAkSgWCDEBQxDUOh8en12k262s75gghGLCQmHScy9y3DhjSws1MizWYKNQZErQkoSsb1Ag4fW9t/5gA9QIgGmleiItiRP/7IMQJAAdgJ2WsvSKhAITsdZOZRZFHM8XGQojsjkm+lKARImBVFBACOAlFqiYDQxYhIvlW/2KDKTjT7rWKBDRNKl2+1YDdgJINRNQRhjjpsKkb0z0yGMsZC/3r97l2nGfvqXHX/P5bxN5kif+Az92kmp+/JK4qWmxQi5z//tUAIwH/+zDEAYAHbKFhrLxjIQcZrHWHiJSSzfeOAMIAkglM1wDykCdnom0ipFas69Ggaemue355ckaQslNpmZFMtvY7+zEfDPUsF9vt6rtrA6Q4yZbbf9rQEqwbYX2z4NLiBHIOUzglKAeFAzgJjXQF6Ijo1k93kZjrc13R6EofTpp0laesrv0mKTsNWVNrQD5RdKoCJkta/b7WgJ2hVQf/+zDEBgAIiMFjrDBG6OwGrHWXmFz9PxCFH9qblmQ0GvIM8yq0e1kKr0rcuXvJY729tUKytOux2dZS1nLM7O66vRYP/2bhiWf57y9kccCOWS23b2yAJ+hUIPDTcNkAzHmabIVDKkRyCgOoJRPnpucaPOTzg2Sc5rJARMKb5vou3m6nRJhVzqNiagFG0FFfta2AVAS5wamgwnWmGwf/+yDECYAHpCthrLDGYQuHLHWWDN2HygKEFKMi3zq60iYhQhBUiISK8TlSrWKGLIKe0g6PQil6HIZ3E4u62kkAtWdBbv/pQEC1zB4aaBetU7R3oEkFDaiBL7Z63XFXyxddUd5yA8ud/Da7RWUWn9NuKJS/PN/uGh0WX//l/7vv8HLb//swxAAASKxPZ+wkaOjwiGz1gwkVECZDKFVv//9gEpYsLfXIX7a+rCzBk9SYwzZ8rqovbFn3l+MNi4RC+bzj+i5uZ5qtX2mFbPPn19Ty9XIdqjVLv/De13oB6CaT0s3/xAV4Rra7A47/t7g0PWiAsWONwgKjc1rWQf7Yd+IGardz/Xj/rf27e32K/ytmyfUvDBwY3tHyqgAjDO5f//swxAKACBRPZawkSOj4huw1hgzU/bYAnayEe+uhJPbmx1qej5QJpsRxRiieLWntel84vhKkuACopp6LfSl+lztaf/3/36/X5kL7u1zhOjygAQYgjl+1jAIBoIRuakBI84x1noZebMkbUSiIWeJnR00bUKLEx5M2aDY4Rl3sWYQ54TFBdy7KQAnuGRrmzCIAEkaTS/fRgJOoTSca//swxAaACHCRY6wwZWj9hWw1h6SMnCB8gGwWje7ydBlEw5dTseXegjZ07l+uf5ank1WW6Nn1p+DMGiAXUZUQcp5Z5x/qxP8x75L/sACiVpzb2SAJTgwJNZOEWO6j0sy5Q5DYJKEaQkS3mEpKrqLlxQgmbKuEAEHy7mRUJsIPQ6pVupgfRFX0XNMGFQAShL7d/bIArKDBpRKwoXuo//swxAiACEA7Y6w8xKEIGyw1gI495lSeFYyZGdZQ0xAoJymr26RIqoQLBqWHg4I77iIqocCI4cLWyKDrVj9oqhFdrW32kwAhhWpJvbYAgWAFojIOoE2gNnaKxzGivvlu/Wkfb2p/1WSncIj6vcuRjCRAjmm5yZZkc5NZSr+sOSomw1uPvU/lmwUggXrb/s2AtkCFSKLOjylWle9I//swxAoACBArY6w9JKkFBiy1haSN6sVeHbzvvLa7JqDvBNC7v8i627Rh58SrtYcyTRs3EBczM7ZV2R3//8+3/92CUgW7ZP/daAo6ZDr6LmpJLVC48BHZOENDqYvbabFvpz3+5ylPpDUr5xj3Z+/mZv1O+Xq0pxLnv7eGfBq/73b++l0FIpF23f/bAHqAIRXAJEK4W0bg4EN9TI2K//sgxAyAB+w1ZaewZOkLFux1gI31gz2ysx685/HPFaNsAfYvb9/u7FLL5Tnza/n/qvb2GoVj9ub/zltgMuNUSX/+wCIg5qgiE0HCLy2m6L1huFzV+Yn6GxubCu819XctjLEMswbAOjzRTaMzchcyKHMev6yRsab064xtE/dtqgU7Av/7MMQBgAcsKWeniMohAIbsdYYI3JL//9QA2gNIRgHyPUUKMHYuSVu8Y7hsXY46NvBYwDZ2KQoNjbFLSScA3CsUUA3mNa6VFeyuwgA0ualLd7owJYLVQGI6o3JPr8ZAMxzMCp0KPDlgdWveIJJEZNJMQ1pns4dQYMEqj9w5ZMoKKTmUrWZAmow9LCq6ARJrtlu9rYD6E4QwhAFjDP/7MMQIAAigg2GsJGyhAAhsNYWI7A1uPo50FwjDrR4tZ84lEduFi+rS0oqvnRBzen/D+GeCMsyYdhatDg00ytyZdMKuR3YsqskOAhALetv+sADoDYAxBUCWkRzVBUGSIci1TiKiRGzvSJIg3VRhIw0skhZEFT6WhUNhoNLTDDSjxFALLCVGTe32nQakK27dv9WA1QOgJIKgxICcS//7MMQJAAf8OWWsJEbpAoUsfYewTPOA0oHKbIRaJjjI15UGue+73HfdRzf/Ujzze36OpBdo/Ox9mqr2hGZ9t2jHo/YCREEmpLb/c4AqgBsCSCUoiBciGStDwa4LyyoYU78B96j9Z4KGN0mHQodGraBmijzGHnBJhcWLLhRacXRc3lhEqgG0rdHvvdGAo8DkJqKzlCV3K8kp4WBCjf/7IMQMAAfALWWsLSYg8QbsdYeMpEGBocTXWem8LPrCLwgH3Tw94ATLnigEU5KO2Kmj7ByhPY5NkpdpBTN8kkv9zgCfgCoJAIQkyWHFJDokEJsl67br8Vj2co+glfTGAEwLJYQCiBEixCyl44XeaaWuy5Jy+1bq6gjUa2/J/bYAi4b/+zDEBQAH2GdjrDBlIOIGbHWGFNShBxBk5EF0gMDUgCYr8jS40g4IrUsqm9LPPn/Zk6nwceMUB4EKqrpXln0X8JhQ895cYya2ODEhTNm/90gBUEajJcEJU2JJC15AiZEfzeecGltYw8SimpYnKEJsctWOZSl9qK6wy96ji1JWino6KhQiMzbv/a4AVEGxxaoFLIkwwG4qGbaqEtL/+yDEDIAIjGthrDBlIPIE7HWHpCTtSuaP+6iNgS+exuNGiR0qhkyiiVF0h0oRe9ZwJULoWxQssXCDvYiho4oCwYZbkTv/sYALCDMoCkUwOlkK5Diva2ZIiTdsyo0TSilKEiYTiMXEQ8E1gYHRCSS20+VFlCYhpr96b1sf0QhAxHZr//swxAKAB/gtY6w9AujvBWz1h6RUvdIASqMiiZzDgeywM4nZayvG0Ne6jDMzc57yDJV5j3Vbo568LhdNt+H2/vN6ZkswtT7evvxXvqZfn/AjBBnfv99aASkBACiTIgnFk1hP0FUWSPf2/up0gJnCERulwGKiITpMpOTf3gQa86JalikpMtkMR1cxIPUAso+yX/+ygEsjAgrOzJCy//swxAgAB9BTY6wkaOEKBay9h4hlKweg233GRol+lSBVVJHZzpZ5m2UjHhLSg8mtCzrBkSjCARQ4cXZRtF2xfst9QSACGDM0ZLv9rQCo4EAK1tyBoPblGW4xH6SZ8u1G4o40q5zlHef5+fnBDlN5CvRLxEX7m5t2sUdjPO9j+cjM7XUn3NsCJUuLbf/wAEkC1BW9mQOI/9dR8baE//sgxAsAB8gjZawwxmjwCCx1h4iUZWDuvqgTTfrUOdc/n4axRaT3+WhnNyEd5NWFbIuGDBLX4f+/y93f5wCIsxq//yWAEGC4BTNfRcBZ8pUlbDTcooGgIaNa196mCnBc2ECY4DPACTDEAmhY/6LxfLewJkFBtc7Uq9UB4VTx7/60AP/7MMQEAAccL2OsPMLhDoisdYSJHVTSPBTZfR2CjPcbpWw5DBosZS3NOs6+gqskWCBQAvbeXmVJHX80/bUGfULRI+MGrCYEwild/32tAINNcKdr6U2IltJa43tccITFDtNJvt+irehzCnTRzHXP0g2p2hWXbFn71adgFVXrllqtU+twY1v3///htQHyy7bvvtWASWkJXtuUNIxrnf/7IMQJAAegM2WsMSYg4AZs9YekVIINk4MQdTqbt67/lsJxEUFAQIFz6ltoJ5NNHGlJQUx1Ro5FQYY4mA0kH5oBRiu/b//WAFSEBlKoCVY1keWwrYYtSpRfv77MePVLaFlWhqTKrQMrbInoOxChOVt6x2oQTqN6agDGDK/tvtGAVLL/+zDEBQAH1DdlrCSm4PcG7P2GDKyrle4Ccdq8KUMFgeFqfT14VEAW944PJDosRFEJeoiUh8oKSCBcTSITYUoUsbQ4Rn6krr0c0AEZmSs03//2AEkEJ5XOJLvaGbA48JhFuj16FRkTD95ZBIcDdCAXJWiEu4wpz7Ts6hUVkwLQtS7tbTDN7WUqAdMcM/++9gBYwFSld4aL/s3bZRz/+yDECgAH6K1lrCSmoPAFbDWWGJQ0HicbHpwhlr2rH3WzzIym6Stt71upEr6MmrlVc+5BZGiQDwMSpbdOraRkgDiFPddvZIASyGK2ThQ8oHMgkAojQEfQjowbpdGBEUUWqWRWowKWl3nUsOmV8jb9j4q9DWBhAxdb0IGjqgFkBGnd//swxAKAB8RDYaywROD0hSz9hIjc/o2AVZDLlKMpcieukCA3GTJGlAz0HUeW9u3GSoILSE4sRFwuUeROkzJ4cD6zosAjCKHJG06aqGbkACQZBLtH//sgBVcYZlY76J6OKEDbi5U0ke+pIMFQuOC4cDbAu5xsCSx4bFqiBN25kTjBEdd94yxGOmzGmuoAtAzG33RpgENRt8lZ9Gzt//sgxAgABxQ3X6ykRuD/Bux9l5gcPlcEvFxmRwdi0k7HVF3jIiIqsBIJpcoMKkEAYVmVgFX3WsRf6vtSJ1AAmomrJHv9sgBC0aM4WUdVjxI66XSOCkzYKvp0h8fWNIOAc2giiHmm2oFxgEYGx7iRkgRPSGLv41ow0OQtnaKVAU4Dbv/7MMQCAAfIf12tJEhhCotsNZMNDF28jgBKyNbNSjtt8LASIjSNOZ644PJ4CHjo11aKv07VUrvKr9rvVlMrQwab9FlI8sRsc9CDBW5lsaNEi0Kf13+rYBI8b+5EU279DRLVogpOoPBg5aEF48KtHJjPJDy+tL9HYbEKTiSglKlFAQeE3CMVNBYKrfNLWmtF1m7SB2IzEmSP/voACv/7IMQFAEeAW2PsrGSg3IbsvZYMzYobdpelM9NIoYCxIC7CO86Njwea+eJ9kU0SnqTakJGJLFHbVpWCiQuWzs9SWWpRzZaPBXU0E2SPf+VDjTlKCX7EIA9IjBDgz030fGo8aHSzxHF6odtf+q9Vafjn+/znQwToMh8+vW8d3tUBZTL/+zDEAYAHuCtj7ODA4OYFLHWcJBQ0VY+20jALCBu1oErYyASIiRCWp0Id8KDC6ZTLQLCouCRq9JoslaFl36VIMB847SNvpT3OOljiXpz2UA8Mczv3+ogBKgb9ZMHMhYgEZo/odTDtOUtNimYPue9RsJPPCYArAzXQEBmmL0RMx2dsFnxZo3/7hVUBwxHWz7uMADpw38UegdYQ9DH/+yDECQAHbDldrSTIIQiIbHWTCU0FD3OoRpJ+HhXy7QuJpCAi9Dhgw8LiwSMxIODA9JSzf4gGfWPakuaYUWB5nL3t//aACwMccZRbgSCFwo8oeuJjMI0HujJLhyI90LtQenaChdb+Dk5nV97Ht4RICxSUB9gyn/Y6w1+m8LWwbrUD//swxACAB4AnYay9gmD8EWx9lgycLF6S2+6SAFUg7ZykmoNgDSfEz8LShqO8VEFv0JSRMoE1FBZxYOqHsW0ox8cEEw3IdfiC9ClTqmtAiRUAclBGV4v+9cAQIHKyUg1GyBgTwFwwaQNVWioamg1Sltf8qf00sT3Jz9idfv5eSSinFiIx7C+u9KzguFKmd2kAczJzdY//3oAVQP7S//swxAaACAQ3ZewwROj3kev1lgjknNSRI5RgXDYvFCFw6bjRwRWa8YH5W/nKkRclwWb9yP+ives23s+EVO5+0bd+ffPJ9N7LAaBKf7/XVsBJw+1yfmMKbp1P+ucbJiyyix9g15BaNv0QX3WSVd3o6FnMRmsVftSr3HKpo08fsqU4Vhj1+2gAdhU0dY//tjAeg5QSdGUAK5KjPNM+//sgxAsACDw9Y+y9IqDyiGy9hgjcl0J4GbecnQ9TWZ8smxiI4cGFGwiHXrJHjBg4LFTZJSK8wytqYwmhWNwW+5IA7kaFKJv9tIBQBOyftIGHboo67QbJkHHYbYrwwWEa1vOOmkqURNic+ZdYo84OhvITK1hwWYp5N3fZKdC1AsViuv/7MMQCAAfYJ2GssSSg6whsNZSJFP2+sYFIGtjaMcQjdALVwQlwQmOH2IIqcAxGsqXKA4XmzKTR5Zh5ZwmDj8hLPY1pYqYzwsWMvSrui1ZgD1Zq16fWuANwO0knQjyEtW5wUq3kjwZc6zZxni85le/kGKaVzajpTsUHRgHDc4hdE+KtbIP1+i4owXUAZCgxRH+31YAbAdoY+jACI//7IMQIgAe8J2HsvMSg+ZcsvYeIlKwB0jDNVuR6lRccVvSIEmqAgjEaC6HyIZgrCg0WBtlix1UiMSpa2tYAXuoV1ADKkmiM//+0oE0GzKUxwumrYP0d5SPohyvHQfsohct20vRVWtUMVG79pbzv5KbKr2RGs+9AUTmsZo0LQZFqVQH/+zDEAIAHHCNjrLzCoQuULH2HjGTT7df/vrABHycIo9mA9nQbpBEry4agg84ShsTrUoVWJ2KrcNfY8yQA6jR8JOFEilRNmu2YffK8KgBosIaNG/2kYDRw/xPWkCyLYh4wCtgI5TTYWaN9StTgxiimnDU9uaG+5fMvvb2EXN+yxC1IEc2tcUdQInRAsqQL26EAQ4VWZHn21gAUfB//+zDEBgBHwDlj7CRo4PqJ7D2XmJyidt4ecwyLtIag+h84LKM0zOrPYV4LoN7p0YxswpNMeixBCWBgqcKCYVDOFkxYspDtCgAzZGZYa/7JTgMYmtpR4p2CnLocbAtrpZXF2Xaujzy3oO+fd3bZirQaKEEsBnIRFXhARBRyF3UUR4rKoOhXUgGmnfvt9dGASBP5CLsdEldalHBvqOD/+yDECwAH5LdhrDBG4PoZbHWAif03z9o2BhNlJI6OhCM83O6avdVkZm+lj0tV31kZLl7UUODDlWKU3cyJigDUahn3+ltAJAnMBMWDUDofb6491DJ8pP/4UW30lCSJBZzRAbQjh8I77dtCwL9c/Ok6emnIFRXrKsXOPdjXXQXLFZv///swxAKACAgpY6w9JGkDEOx1gI3tvdaASjOIiZLRURmviisWqRDq5/ekZp/aJfyetHsvSyaZfZ2OBXdHmnfz387QQu71/MgZwHvrf/d2kdHCuksz3/90YBVKbxEzVZQxReNC6ng+DbVDLu8uY6AUnd2RINSTuz+ZQ5e5N3YLebtb3uKo2XOmUL/7TWu8sfl/cwppI7P9/LGAVEnM//swxAWAB9wnYaw9JCD4BSw1h6BcSLKhq2kUxzLJoDxIMmP1H0zJypogUY1iSUIpjA0CYhABQkN50k54cMPesasBuvlxiop12ip3Wa7ffZsAqPM6BJ5KcQFBFLtKnYjWQI1yqgyARjAgfNhdo9jhhRLw/k1PeIY0DsL0QwERVTyDg+6ilz/SAzV3SFiP/9pACoUtkImUIIFyFTVZ//sgxAqAB/QjZew8wOkEDWx9hgzcKL0HfDhsG2pIeU6a7r+30b9qY7S/5q6+Vv747w2RjfVx7WjjfZN+r+Y/SCCjO0K73/2uAFVJZ4m20lXtZqONRURjt7UTGNvH3gsx6VL8i3RpymWfmJYwgsTeEzzWLc6RgUVFbELV3XC3PEC1Af/7MMQAgAiEc2PsBE9o64Ws/PWYzDR0aEad/9owCqstkrXZEkwA5mFiJSOve1O2JfdZuwswCRErNo6qafJAsQtsosdFyBl4Lb/rEDnPI9RuP732cn8+3/mAnMusxD///SgAhwvhtwAfqcCZj5KC6YZswcUlJzipx15wKR+aoJP3pGtFw4F0HIhchjGLm9ov1sqLagAndldWj/exwP/7MMQEgAgIe2HsMGThFpVrfYSNHAqtL3JZxxA13DsEzaAjNGsD+4JKNkY29nhjWrINMlQi+//DVGxIkCxQ2l5YWcw9YtlGM71PuXqAThWRlZbd5UQCrcRiDFNgCItMRWL7sQgo2UE6hMlaQ75+GxFzM/Iu8k3GMi9tP8jQ45ut+PPOFco7oCE4qQmF17WOmUvYAWdHOHdtvppAKf/7MMQFAAhggWHsMGchAgUsPYYgnUemRAaoDAssVa7gwTREF5p9PVo02LkpQp3P+94eUW5xr21J0sx82/oKRGAzKVLFLCRkdRUJJ4QvjwFmRkeGjfaWQCoRPKCNGSfV4EIFAwTPF/Lo33DSGuKLwte7wl8B/7siX1dWLjT5P/3/lF3ut62IrH5RkRt97nF6AnZWWHqP/9pAL5WErP/7MMQGgAkAhWPsJGlo5QXrtYeYVIz4v+kBOrwcygFzo4vK0B2ev8ZZZr/ZXpyNnEQjcJGJrv5sf15RFcDv1gFHsIJ9zSaheU+/+RtvtGvUBk7W110rZYEbIrFZGZCllJsZBNWAO4Z8xB9nesg8OFhIJnLjXCwwKiWoVjFtvmVssvRQwj+7ws5TqgFUZEaIbffRICGByDsO4PZWRv/7IMQJAAf0cV/noGsg7JPsNYMJJCoKeK7kCupBuzh4y2qGvfeR59TXOubEa5dUIEiDtgdEBFazo1psXcZH9H+KqLp+S/7/e7UIByxZyLLpEymg2nwbPisCInWBTWuj0a1zW596NUxPuur8tqu7XVSFdWVDhpppvcOLEj3/qg7nrNf/+zDEAgAHvCNZtPAAIQOKrj8yMkBZG2SAuwIwL0fQTyhSQkBXVkUznufE6AbBs+SIvD4ZWpbSFwCoD60LU98yE1CqEUDBQ2gY1fdQuYXW6OqyiyrA728Z+NhaIAAAAfKTnFkYdrdbtlLpFS772m5j+45fKeHBdVVZhh0GIlB4CLBJ+9h0agd3AcBGmrdytyJMQU1FMy45OC4yqqr/+xDEBgPAAAH+HAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqg=="
}catch(e){
}
setTimeout("beno_game_system_start0()",16)  // 16 mili seconds of yield time, then continue to function 0
}////////////////////////////////////////////////////////////////////////////////////////////////////// end of function
function beno_game_system_start0(){  // welcome to function 0. This will loop until sound test has either loader or it has given up after so many attempts
if (gjfdopigjfidpgjpdfgjpsd || loaderdebugggy){
loadersounderror = false  // THIS CODE RUNS IF TEST IS SUCSESFULL
if (!loaderdebugggy){
setTimeout("hdfuiodsghosfdghfuidosghudo.play();",16)  // if HTML5 sound is ok then after 16 mili seconds skip function 1 and continue to function 2
}
beno_game_system_start2()
}else{
if (puiokppohkopkopjkojkpkj < 32){  // AT THIS POINT THE TEST SOUND HAS NOT LOADED - SO TRYING AGAIN
puiokppohkopkopjkojkpkj++
setTimeout("beno_game_system_start0()",16)  // TRY AGAIN
}else{
loadersounderror = true  // THIS CODE RUNS IF TEST IS FAIL
setTimeout("beno_game_system_start2()",16)  // after 16 mili seconds yield time go to function 1
}}}////////////////////////////////////////////////////////////////////////////////////////////////////// end of function
function beno_game_system_start2(){
loadersimnum = 4  // simutanius downloads
loadermaxsounds = loadersoundsfile.length  // max images and sounds from array
loadermaximages = loaderimagesfile.length
q = 0
while (q < loadermaxsounds){  // loop though all sounds setting their loaded status to 0 (0 - red, 1 - yellow, 2 - green)
window["loadersoundsyay" + q] = 0
q++
}
q = 0
while (q < loadermaximages){  // loop though all images setting their loaded status to 0 (0 - red, 1 - yellow, 2 - green)
window["loaderimagesyay" + q] = 0
q++
}
number_of_loaders = loadersimnum  // set the active loaders to the simuatinus loader number. this will go to zero when all loaders have completed
zxcv = 0
while (zxcv < loadersimnum){  // run the main loader function the number of times that their are simultainus loaders
the_big_fat_loader()
zxcv++
}
setTimeout("the_big_fat_checker()",16)  // run the checking function while the loader function is running
}
/////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////// LOADER SYSTEM
/////////////////////////////////////////////////////////////////////////
function the_big_fat_loader(){  // there will be several of these running at the same time (number_of_loaders)
console.debug()
if (gamecanstartyayyay){
thetimer = 0
var qq = 0  // goes to 1 when found somthing to load (each simualtainus loader can only load one item at a time)
var q = 0  // the sound in question (in while loops)
while (q < loadermaxsounds){  // check to see if a sound needs loading
if (((eval("loadersoundsyay" + q)) == 0) && (qq == 0)){
qq = 1
loadersoundnum = q  // load a sound
if (loadersounderror){  // IF HTML5 AUDIO HAS FAILED
window[loadersoundsname[loadersoundnum]] = new Object()  // This is clever! I have created the exact same commands for sound manager asthe commands for HTML5 audio, it will now be a seemless transition between the two!
eval(loadersoundsname[loadersoundnum] + ".play = function(){}")
eval(loadersoundsname[loadersoundnum] + ".pause= function(){}")
window["loadersoundsyay" + q] = 2
setTimeout("the_big_fat_loader()",16);
}else{  // HTML5 AUDIO - YAY
window[loadersoundsname[loadersoundnum]] = new Audio();  // create a new html5 audio
eval (loadersoundsname[loadersoundnum] + ".addEventListener('canplaythrough', function(){loadersoundsyay" + q + " = 2;setTimeout(\"the_big_fat_loader()\",16);})")  // listener for when loaded. The simualtanious loader stops after finding one item to load - so therfor when this loades it runs the main laoding function to re establish the simultainus loader.
window["loadersoundsyay" + q] = 1  // set audio to yellow
if (loadersoundsloop[loadersoundnum] == 1){  // loop option
window[loadersoundsname[loadersoundnum]].addEventListener('ended', function(){this.currentTime = 0;this.play();});
}
if (loaderdebugggy){  // and finally, start loading the audio file
window[loadersoundsname[loadersoundnum]].src = (loadersoundsfile[loadersoundnum] + "?" + Math.random())  // in debug mode a random number is put on the end to bypass cache
}else{
window[loadersoundsname[loadersoundnum]].src = loadersoundsfile[loadersoundnum]  // when not in debug mode there is no random number so that cache can be used
}}}
q++
}
if (qq == 0){  // if it has got to this stage with qq still being zero then all the sounds have loaded, so now onto the images.
q = 0
while (q < loadermaximages){  // check to see if an image needs loading
if (((eval("loaderimagesyay" + q)) == 0) && (qq == 0)){
qq = 1
loaderimgnum = q // load an image
window["loaderimagesyay" + q] = 1
window[loaderimagesname[loaderimgnum]] = new Image();
window[loaderimagesname[loaderimgnum]].datapoopoopooweepoo = false;
window[loaderimagesname[loaderimgnum]].addEventListener('load', function(){this.datapoopoopooweepoo = true;the_big_fat_loader()})
if (loaderdebugggy){  // Load the image file. When in debug mode include a cache bypass
window[loaderimagesname[loaderimgnum]].src = (loaderimagesfile[loaderimgnum] + "?" + Math.random())
}else{
window[loaderimagesname[loaderimgnum]].src = loaderimagesfile[loaderimgnum]
}}
q++
}}
if (qq == 0){  // if it has reached this stage, then everything has loaded. The game will start when all of the simualtainus loaders get to this point.
number_of_loaders--
if (number_of_loaders < 0){
console.warn("The loader system has gone wrong. A loader has returned leaving the number of loaders as " + number_of_loaders)
}}}else{
console.warn("A loader tried to load something when the game has started")
}}
/////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////// CHECK THAT EVERYTHING IS LOADED
/////////////////////////////////////////////////////////////////////////
function the_big_fat_checker(){
if (!gamecanstartyayyay){
console.warn("The loading screen tried to run after the game has started")
}
ctx.fillStyle = "rgb(0,0,0)";
ctx.fillRect (0, 0, 640, 480);
ctx.font = 'bold 32pt Arial'
// LOGO
ctx.shadowOffsetX = 0;ctx.shadowOffsetY = 0;
if (framenumber < 50){
ctx.shadowBlur = (50 - framenumber);ctx.fillStyle = ("rgb(" + Math.floor((framenumber / 50)*170) + "," + 0 + "," + Math.floor((framenumber / 50)*255) + ")");
}else{
ctx.shadowBlur = 0;ctx.fillStyle = 'rgb(170,0,255)';
}
if (framenumber < 16){
ctx.shadowColor = ("rgba(" + Math.floor((framenumber / 16)*170) + "," + 0 + "," + Math.floor((framenumber / 16)*255) + "," + 1 + ")")
}else{
ctx.shadowColor = 'rgba(170,0,255,1)'
}
ctx.fillText("BENO", 320, 240);ctx.shadowColor = 'rgba(0, 0, 0, 0)';
if (isIE){  // IE IS CRAP
if (framenumber < 50){
ctx.shadowBlur = (50 - framenumber);ctx.fillStyle = ("rgb(" + Math.floor((framenumber / 50)*255) + "," + Math.floor((framenumber / 50)*255) + "," + Math.floor((framenumber / 50)*255) + ")");
}else{
ctx.shadowBlur = 0;ctx.fillStyle = 'rgb(255,255,255)';
}
ctx.font = '16pt Arial'
ctx.fillText("INTERNET EXPLORER IS CRAP", 320, 445);
}
ctx.font = '8pt Arial'
all_loaded = 0
qpoo = 0
while (qpoo < loadermaxsounds){ // check to see if a sound needs loading
qpoonum = eval("loadersoundsyay" + qpoo)
if (qpoonum == 0){
ctx.fillStyle = "rgb(255,0,0)";
}
if (qpoonum == 1){
ctx.fillStyle = "rgb(200,200,0)";
}
if (qpoonum == 2){
ctx.fillStyle = "rgb(40,255,40)"; all_loaded++
}
if (loaderdebugggy){
ctx.fillText(loadersoundsfile[qpoo], 60, ((12 * qpoo) + 12))
}
qpoo++
}
qpoo = 0
while (qpoo < loadermaximages){ // check to see if an image needs loading
qpoonum = eval("loaderimagesyay" + qpoo)
if (qpoonum == 1){
if (window[loaderimagesname[qpoo]].datapoopoopooweepoo == true){
window["loaderimagesyay" + qpoo] = 2
}}
if (qpoonum == 0){
ctx.fillStyle = "rgb(255,0,0)";
}
if (qpoonum == 1){
ctx.fillStyle = "rgb(200,200,0)";
}
if (qpoonum == 2){
ctx.fillStyle = "rgb(40,255,40)"; all_loaded++
}
if (loaderdebugggy){
ctx.fillText(loaderimagesfile[qpoo], 580, ((12 * qpoo) + 12))
}
qpoo++
}
ctx.font = '14pt Arial'
ctx.fillStyle = "rgb(255,255,255)"; 
if (loaderdebugggy){
ctx.fillText("BENO LOADER SYSTEM VERSION 3.2", 320, 20)
ctx.fillText("(HORSE MEAT EDITION PLUS!)", 320, 40)
ctx.fillText(("HTML5 sound has error: " + loadersounderror), 320, 360)
ctx.fillText(("Loading: " + ((Math.floor((all_loaded / (loadermaximages + loadermaxsounds)) * 100)) + "%")), 320, 380)
ctx.fillText(("Frames: " + framenumber), 320, 400)
ctx.fillText(("Loaders: " + number_of_loaders), 320, 420)
}
if (framenumber > 60){
if (framenumber < 66){
ctx.fillStyle = ("rgb(" + Math.floor(((framenumber - 60) / 6)*255) + "," + Math.floor(((framenumber - 60) / 6)*255) + "," + Math.floor(((framenumber - 60) / 6)*255) + ")");
}else{
ctx.fillStyle = "rgb(255,255,255)";
}
ctx.font = '10pt Arial'
ctx.fillText(((Math.floor((all_loaded / (loadermaximages + loadermaxsounds)) * 100)) + "%"), 320, 470);
}
if ((number_of_loaders == 0) && (buggystart == 1000000000)){  // starts up the debug load finish timeout
buggystart = (framenumber + 40)
}
if (thetimer > 200){  // shows debug if it takes too long
loaderdebugggy = true
}
thetimer++
if ((thetimer > 400) && (number_of_loaders > 0)){
if(loadertttttt.indexOf('?') == -1){
window.location.replace(window.location.href + "?")
}else{
location.reload()
}}else{
if (((all_loaded == (loadermaximages + loadermaxsounds)) && (gamecanstartyayyay) && (framenumber > 48) && ((!loaderdebugggy) || ((loaderdebugggy) && (framenumber > buggystart))))){
gamecanstartyayyay = false;ctx.shadowColor = 'rgba(0, 0, 0, 0)';ctx.shadowBlur = 0;ctx.shadowOffsetX = 0;ctx.shadowOffsetY = 0;
setTimeout("letgoyayyay()",64) 
}else{
framenumber++
setTimeout("the_big_fat_checker()",32)
}}}
function letgoyayyay(){
if (loadersounderror){
alert("No sound")
}
mousemode = 0;loopmode = 0;
startup_function()
nowtime = ((new Date()).getTime());lasttime = (nowtime - 10);fps = 100;












canvas.addEventListener('touchstart', function(e){e.preventDefault();if (inmobileview){

if ((mobilemode == "wheelie") || (mobilemode == "nokeyboard")){
x = (event.touches[0].pageX / (window.innerWidth / 640));
y = (event.touches[0].pageY / (window.innerHeight / 480));
}else{
x = (event.touches[0].pageX / ((window.innerWidth * 0.75) / 640));
y = (event.touches[0].pageY / (window.innerHeight / 480));
}


if ((x > 0) && (x < 640) && (y > 0) && (y < 480)){
m_down()
}


}else{if(mobilemode != "none"){inmobileview = true;

mrmousedown = 1; mrmouseup = 1; mrmousemove = 1;x = -100; y = -100;

try{
var elem = document.getElementById("theAdvert"); elem.parentNode.removeChild(elem);
}catch(e){}

document.body.style.background = 'none';
document.body.style.backgroundColor = '#000000';
fullScreenViewMode = true

if(mobilemode == "wheelie"){
canvas.addEventListener('touchmove', function(e){e.preventDefault();if (inmobileview){
axmouse = (event.touches[0].pageX / (window.innerWidth / 640));
aymouse = (event.touches[0].pageY / (window.innerHeight / 480));
m_move()
}})


canvas.addEventListener('touchend', function(e){e.preventDefault();if (inmobileview){
x = (event.touches[0].pageX / (window.innerWidth / 640));
y = (event.touches[0].pageY / (window.innerHeight / 480));
m_up()

}})
canvas.addEventListener('touchleave', function(e){e.preventDefault();if (inmobileview){
x = (event.touches[0].pageX / (window.innerWidth / 640));
y = (event.touches[0].pageY / (window.innerHeight / 480));
m_up()
}})
canvas.addEventListener('touchcancel', function(e){e.preventDefault();if (inmobileview){
x = (event.touches[0].pageX / (window.innerWidth / 640));
y = (event.touches[0].pageY / (window.innerHeight / 480));
m_up()
}})




}


if ((mobilemode != "wheelie") && (mobilemode != "nokeyboard")){



var canvas2 = document.createElement('canvas');

canvas2.id = "canvas2";
canvas2.width = 200;
canvas2.height = 480;
canvas2.style.position = "absolute";
canvas2.style.padding = "0px";
canvas2.style.margin = "0px";
canvas2.style.top = "0px";
canvas2.style.left = "0px";
document.body.appendChild(canvas2);
canvas2 = document.getElementById("canvas2");
ctx2 = canvas2.getContext("2d");



canvas2.addEventListener('touchstart', function(e){e.preventDefault();multimanager(event.targetTouches)})
if(document.title != "MOUSE'S REVENGE"){
canvas2.addEventListener('touchend', function(e){e.preventDefault();multimanager(event.targetTouches)})
canvas2.addEventListener('touchleave', function(e){e.preventDefault();multimanager(event.targetTouches)})
canvas2.addEventListener('touchmove', function(e){e.preventDefault();multimanager(event.targetTouches)})
canvas2.addEventListener('touchcancel', function(e){e.preventDefault();multimanager(event.targetTouches)})
}
multimanagerdraw()


}
setFullScreen()
}}})



















gamego = true;loop_function()
}















//////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////  LOADING IS NOW COMPLETE - SO HERE ARE SOME OTHER GLOBLE FUNCTIONS  /////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////


mrmousedown = 1; mrmouseup = 1; mrmousemove = 1;x = -100; y = -100;
function desktopFullScreenMode(){
try{
var elem = document.getElementById("theAdvert"); elem.parentNode.removeChild(elem);
}catch(e){}
mrmousedown = 1; mrmouseup = 1; mrmousemove = 1;x = -100; y = -100;
document.body.style.background = 'none';
document.body.style.backgroundColor = '#000000';
fullScreenViewMode = true









setFullScreen()
}

function setFullScreen(){
if (fullScreenViewMode){
document.getElementById("thePositioner").style.top = "0px";
document.getElementById("thePositioner").style.left = "0px";


if (inmobileview){
if ((mobilemode == "wheelie") || (mobilemode == "nokeyboard")){
canvas.style.width=  ("" + window.innerWidth + "px")
canvas.style.height=  ("" + window.innerHeight + "px")

}else{
	

	
canvas.style.width=  ("" + Math.floor(window.innerWidth * 0.75) + "px")
canvas.style.height=  ("" + window.innerHeight + "px")
canvas2.style.width=  ("" + (window.innerWidth * 0.25) + "px")
canvas2.style.height=  ("" + window.innerHeight + "px")
canvas2.style.left=  ("" + (window.innerWidth * 0.75) + "px")
	
}
}else{
	
	if ((window.innerWidth * 0.75) > window.innerHeight){

		canvas.style.width=  ("" + (window.innerHeight * 1.33334) + "px")
		canvas.style.height=  ("" + window.innerHeight + "px")

	}else{
		canvas.style.width=  ("" + window.innerWidth + "px")
		canvas.style.height=  ("" + (window.innerWidth * 0.75) + "px")

	}
	
	
}




}}






/////////////////////////////// mouse
gamego = false;mrmousedown = 1; mrmouseup = 1; mrmousemove = 1;x = 100; y = 100;
function mm_down(ev){
if ((gamego) && (!inmobileview)){
if (mrmousedown == 1){
mrmousedown = 0
if (gameframe){
if(fullScreenViewMode){
x=  ev.clientX / (eval(canvas.style.width.substring(0, canvas.style.width.length-2)) / 640)
y=  ev.clientY / (eval(canvas.style.height.substring(0, canvas.style.height.length-2)) / 480)
}else{
x = (ev.clientX - 140)
y = (ev.clientY - 30)
}






if ((x > 0) && (x < 640) && (y > 0) && (y < 480)){
m_down()
}}else{
x = ev.clientX
y = ev.clientY
}
mrmousedown = 1
}}}
function mm_move(ev){

if ((gamego) && (!inmobileview)){
if (mrmousemove == 1){
mrmousemove = 0
if (gameframe){

if(fullScreenViewMode){
x=  ev.clientX / (eval(canvas.style.width.substring(0, canvas.style.width.length-2)) / 640)
y=  ev.clientY / (eval(canvas.style.height.substring(0, canvas.style.height.length-2)) / 480)
}else{
x = (ev.clientX - 140)
y = (ev.clientY - 30)
}

}else{
x = ev.clientX
y = ev.clientY
}
m_move()
mrmousemove = 1
}}}
function mm_up(ev){
if ((gamego) && (!inmobileview)){
if (mrmouseup == 1){
mrmouseup = 0
if (gameframe){
if(fullScreenViewMode){
x=  ev.clientX / (eval(canvas.style.width.substring(0, canvas.style.width.length-2)) / 640)
y=  ev.clientY / (eval(canvas.style.height.substring(0, canvas.style.height.length-2)) / 480)
}else{
x = (ev.clientX - 140)
y = (ev.clientY - 30)
}
}else{
x = ev.clientX
y = ev.clientY
}
m_up()
mrmouseup = 1
}}}
function mrclick(qrewyrwqyeua,qrewyrwqyeub,qrewyrwqyeuc,qrewyrwqyeud,qrewyrwqyeue){
if ((x > qrewyrwqyeua) && (x < qrewyrwqyeub) && (y > qrewyrwqyeuc) && (y < qrewyrwqyeud)){
eval (qrewyrwqyeue)
}}
function mrbutton(godoapoonowpooXstart,godoapoonowpooXfinish,godoapoonowpooYstart,godoapoonowpooYfinish,godoapoonowpootext,godoapoonowpootextfontsize,godoapoonowpoocoltext,godoapoonowpoocol1,godoapoonowpoocol2,godoapoonowpoocoldown1,godoapoonowpoocoldown2,godoapoonowpooborder){
ctx.fillStyle = godoapoonowpoocoltext
godoapoonowpooR = (godoapoonowpooborder * 3)
ctx.beginPath();
ctx.moveTo(godoapoonowpooXstart+godoapoonowpooR, godoapoonowpooYstart);
ctx.lineTo(godoapoonowpooXstart+(godoapoonowpooXfinish - godoapoonowpooXstart)-godoapoonowpooR, godoapoonowpooYstart);
ctx.quadraticCurveTo(godoapoonowpooXstart+(godoapoonowpooXfinish - godoapoonowpooXstart), godoapoonowpooYstart, godoapoonowpooXstart+(godoapoonowpooXfinish - godoapoonowpooXstart), godoapoonowpooYstart+godoapoonowpooR);
ctx.lineTo(godoapoonowpooXstart+(godoapoonowpooXfinish - godoapoonowpooXstart), godoapoonowpooYstart+(godoapoonowpooYfinish - godoapoonowpooYstart)-godoapoonowpooR);
ctx.quadraticCurveTo(godoapoonowpooXstart+(godoapoonowpooXfinish - godoapoonowpooXstart), godoapoonowpooYstart+(godoapoonowpooYfinish - godoapoonowpooYstart), godoapoonowpooXstart+(godoapoonowpooXfinish - godoapoonowpooXstart)-godoapoonowpooR, godoapoonowpooYstart+(godoapoonowpooYfinish - godoapoonowpooYstart));
ctx.lineTo(godoapoonowpooXstart+godoapoonowpooR, godoapoonowpooYstart+(godoapoonowpooYfinish - godoapoonowpooYstart));
ctx.quadraticCurveTo(godoapoonowpooXstart, godoapoonowpooYstart+(godoapoonowpooYfinish - godoapoonowpooYstart), godoapoonowpooXstart, godoapoonowpooYstart+(godoapoonowpooYfinish - godoapoonowpooYstart)-godoapoonowpooR);
ctx.lineTo(godoapoonowpooXstart, godoapoonowpooYstart+godoapoonowpooR);
ctx.quadraticCurveTo(godoapoonowpooXstart, godoapoonowpooYstart, godoapoonowpooXstart+godoapoonowpooR, godoapoonowpooYstart);
ctx.fill();  
var grdpooweesickfart=ctx.createLinearGradient(0,(godoapoonowpooYstart + godoapoonowpooborder),0,(godoapoonowpooYfinish - godoapoonowpooborder));
if ((x > godoapoonowpooXstart) && (x < godoapoonowpooXfinish) && (y > godoapoonowpooYstart) && (y < godoapoonowpooYfinish)){
grdpooweesickfart.addColorStop(0,godoapoonowpoocoldown1);
grdpooweesickfart.addColorStop(1,godoapoonowpoocoldown2);
}else{
grdpooweesickfart.addColorStop(0,godoapoonowpoocol1);
grdpooweesickfart.addColorStop(1,godoapoonowpoocol2);
}
ctx.fillStyle=grdpooweesickfart
ctx.fillRect((godoapoonowpooXstart + godoapoonowpooborder),(godoapoonowpooYstart + godoapoonowpooborder),((godoapoonowpooXfinish - godoapoonowpooXstart) - (godoapoonowpooborder * 2)),((godoapoonowpooYfinish - godoapoonowpooYstart) - (godoapoonowpooborder * 2)))
ctx.fillStyle = godoapoonowpoocoltext
ctx.font = godoapoonowpootextfontsize
ctx.fillText(godoapoonowpootext, (godoapoonowpooXstart + ((godoapoonowpooXfinish - godoapoonowpooXstart) / 2)), (godoapoonowpooYstart + ((godoapoonowpooYfinish - godoapoonowpooYstart) / 2)))
}


/////////////////////////////// keyboard
key_left = false
key_right = false
key_up = false
key_down = false
key_space = false

function k_down(event){
if (gamego){
	if (event.keyCode == 32) // space
		key_space = true;
	else if (event.keyCode == 37) // left
		key_left = true;
	else if (event.keyCode == 38) // up
		key_up = true;
	else if (event.keyCode == 40) // down
		key_down = true;
	else if (event.keyCode == 39) // right
		key_right = true;
}}
function k_up(event){
if (gamego){
	if (event.keyCode == 32) // space
		key_space = false;
	else if (event.keyCode == 37) // left
		key_left = false;
	else if (event.keyCode == 38) // up
		key_up = false;
	else if (event.keyCode == 40) // down
		key_down = false;
	else if (event.keyCode == 39) // right
		key_right = false;
}}



function getCookie(c_name)
{
var i,x,y,ARRcookies=document.cookie.split(";");
for (i=0;i<ARRcookies.length;i++)
{
  x=ARRcookies[i].substr(0,ARRcookies[i].indexOf("="));
  y=ARRcookies[i].substr(ARRcookies[i].indexOf("=")+1);
  x=x.replace(/^\s+|\s+$/g,"");
  if (x==c_name)
    {
    return unescape(y);
    }
  }
}

function setCookie(c_name,value,exdays)
{
var exdate=new Date();
exdate.setDate(exdate.getDate() + exdays);
var c_value=escape(value) + ((exdays==null) ? "" : "; expires="+exdate.toUTCString());
document.cookie=c_name + "=" + c_value;
}



function multimanager(fgfgfg){

key_left = false
key_right = false
key_up = false
key_down = false
key_space = false
var t_dfjgoedijf = 0
while(t_dfjgoedijf < fgfgfg.length){

if (fgfgfg[t_dfjgoedijf].pageX > (window.innerWidth * 0.75)){
var xxxxxxqweaa = fgfgfg[t_dfjgoedijf].pageX
var yyyyyyqweaa = fgfgfg[t_dfjgoedijf].pageY

xxxxxxqweaa = ((((xxxxxxqweaa / window.innerWidth) * 4) - 3) * 200)
yyyyyyqweaa = ((yyyyyyqweaa / window.innerHeight) * 480)

if ((xxxxxxqweaa > 50)  && (xxxxxxqweaa < 150) && (yyyyyyqweaa > 0) &&   (yyyyyyqweaa < 100)){key_space=true}
if ((xxxxxxqweaa > 50)  && (xxxxxxqweaa < 150) && (yyyyyyqweaa > 180) && (yyyyyyqweaa < 280)){key_up=true}
if ((xxxxxxqweaa > 0)   && (xxxxxxqweaa < 100) && (yyyyyyqweaa > 280) && (yyyyyyqweaa < 380)){key_left=true}
if ((xxxxxxqweaa > 100) && (xxxxxxqweaa < 200) && (yyyyyyqweaa > 280) && (yyyyyyqweaa < 380)){key_right=true}
if ((xxxxxxqweaa > 50)  && (xxxxxxqweaa < 150) && (yyyyyyqweaa > 380) && (yyyyyyqweaa < 480)){key_down=true}


}


t_dfjgoedijf++
}




multimanagerdraw()
}


function multimanagerdraw(){
ctx2.fillStyle = "#000000";
ctx2.fillRect(0, 0, 200, 480);
ctx2.fillStyle = "#FFFFFF";
if ((mobilemode != "basickeyboard") && (mobilemode != "verybasickeyboard")){
ctx2.fillRect(50, 4, 96, 96);
}
if (mobilemode != "verybasickeyboard"){
ctx2.fillRect(50, 182, 96, 96);
}
ctx2.fillRect(4, 282, 96, 96);
ctx2.fillRect(102, 282, 96, 96);
if (mobilemode != "verybasickeyboard"){
ctx2.fillRect(50, 382, 96, 96);
}
if ((mobilemode != "basickeyboard") && (mobilemode != "verybasickeyboard")){
if (key_space){ctx2.fillStyle = "#BBBB99"}else{ctx2.fillStyle = "#111111"}
ctx2.fillRect(52, 6, 92, 92);
}
if (mobilemode != "verybasickeyboard"){
if (key_up){ctx2.fillStyle = "#BBBB99"}else{ctx2.fillStyle = "#111111"}
ctx2.fillRect(52, 184, 92, 92);
}
if (key_left){ctx2.fillStyle = "#BBBB99"}else{ctx2.fillStyle = "#111111"}
ctx2.fillRect(6, 284, 92, 92);
if (key_right){ctx2.fillStyle = "#BBBB99"}else{ctx2.fillStyle = "#111111"}
ctx2.fillRect(104, 284, 92, 92);
if (mobilemode != "verybasickeyboard"){
if (key_down){ctx2.fillStyle = "#BBBB99"}else{ctx2.fillStyle = "#111111"}
ctx2.fillRect(52, 384, 92, 92);
}
ctx2.fillStyle = "#FFFFFF";
ctx2.textAlign = "center";
if ((mobilemode != "basickeyboard") && (mobilemode != "verybasickeyboard")){
ctx2.font = '16pt Calibri';
ctx2.fillText(mobilemode, 100, 62);
}
if (mobilemode != "verybasickeyboard"){
ctx2.font = '30pt Calibri';
ctx2.fillText('^', 100, 250);
}
ctx2.font = '20pt Calibri';
ctx2.fillText('<', 50, 338);
ctx2.fillText('>', 150, 338);
if (mobilemode != "verybasickeyboard"){
ctx2.fillText('v', 100, 430);
}



}



