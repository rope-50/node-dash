DashClient = function(videoData, container, callback){
  // Endpoint that returns the normalized representation list for this stream.
  // (Decoupled from the original YouTube-specific video id.)
  this.manifestUrl = videoData.manifest;
  this.buildHTML(container);
  this.container = container;
  this.callback = callback;
  this.mediaResources    = [];
  this.sequence = videoData.sequence;
  this.a_sequence = videoData.audio_sequence;
  this.length = videoData.video_length;
  this.videoSequence = [];
  this.audioSequence = [];
  this.video = null;
  this.bufferCounter = 0;
  this.currentVideoRep;
  this.currentAudioRep;
  this.fullscreen = false;
  this.BUFFERING = "BUFFERING";
  this.ticks = [];
  this.state = 'STOPED';
  if(this.compatible)
    this.init();
  else
    this.callback();
};

DashClient.prototype.onBufferStart = function(){
  if(++this.bufferCounter === 2){//(this.videos.length + this.audios.length)){
    console.log('The video buffer is ready');
    this.currentAudioRep = this.audioR[0].$.id;
    this.currentVideoRep = this.videoR[0].$.id;
    $(this.el).trigger('videoJump',[this.currentVideoRep]);
    $(this.el).trigger('audioJump',[this.currentAudioRep]);
    var self = this;
    this.video.ontimeupdate = function(){ self.onTimeUpdate( this.currentTime); };
    //SETTING CONTROLS
    $(this.el).find('input').attr('max', this.length);
    $(this.el).find('video').show();
    $(this.el).find('.media-controls').show();
    this.width = $(this.video).width() ? $(this.video).width() : 500;
    $(this.el).find('input').css('width', this.width-125).css('margin-left','20px');
    $(this.el).find('.loading-bar').css('width', this.width);
    $(this.el).find('.media-information').css('display','inline-block');
    this.setTicks();
    this.callback();
  }
};

//CREATE <datalist> element for changes anotation inside video
DashClient.prototype.setTicks = function(){
  var datalist = document.createElement('datalist');
  datalist.id = 'buffering-ticks';
  $(datalist).html(this.ticks.map(function(tick){ return '<option>'+tick+'</option>'; }).join(''));
  $(this.el).append(datalist);
  $(this.el).find('input').attr('list','buffering-ticks');
};

//initialize events inside the video application
DashClient.prototype.setEvents = function(){
  var self = this;
  /* Trigger when the sequence is ready for starts its reproduction*/
  $(this.el).on('bufferReady', function(){   
    self.onBufferStart();
  });

  $(this.el).find('input').change(function(){
    //ERASE JUMPED MARKS
    self.videoSequence.map(function(video){
    if(video.jumped === true && video.id !== 'BUFFERING')
      video.jumped =  false;
    });
    self.audioSequence.map(function(audio){audio.jumped =  false;});
    //SET NEW CURRENT TIME
    self.setCurrentTime(this.value); 
    //console.log('input change')
  });

  $(this.el).find('input').on('mousedown', function(){
    var state = self.state
    self.pause();
    if(state === 'PLAYING')
      self.state = "SEEKING";
    $(this).trigger('cancelBuffering');
  });

  $(this.el).find('input').on('mouseup', function(){
    if(self.state === 'SEEKING'){
      self.play();
    }
  });

  $(this.el).on('videoJump', function(event, id){
    self.currentVideoRep =  id;
    var videoD = self.getRepresentationById(id);
    $(self.el).find('.video-info').text('Video: '+Math.round(parseInt(videoD.$.width)*.5625) +'p');
  });

  $(this.el).on('audioJump', function(event, audioIndex){
    self.currentAudioRep = audioIndex;
    var audioD = self.getRepresentationById(audioIndex);
    $(self.el).find('.audio-info').text('Audio: '+audioD.$.bandwidth +'[bps]');
  });

  $(this.el).on('finished', function(event, duration){
    self.stop();
    $(self.el).find('.loading-info').text('Finished: '+duration+' [Sec]');
  });

  $(this.el).on('videoBuffering', function(e, bufferingTime){
    if(self.state === 'PLAYING'){  
      self.pause();
      self.state = self.BUFFERING;
      console.log('Buffering Video', bufferingTime+ ' [Sec]');
      $(self.el).find('.loading-info').text('Buffering ['+bufferingTime+'] [Sec]');
      //self.startLoadingBar(bufferingTime*1000);
      self.startLoadingBar(1.5*1000);
      self.bufferingTimer = setTimeout(function(){
        self.play();
        $(self.el).find('.loading-info').text('');
      //}, bufferingTime*1000);
      }, 1.5*1000);
    }
    else{
      self.state = 'BUFFERING_ON_PLAY';
      self.bufferingTime = bufferingTime;
    }
  });

  $(this.el).on('cancelBuffering', function(e){
    if(self.bufferingTimer){
      clearTimeout(self.bufferingTimer);
      self.timer = null;
      $(self.el).find('.loading-info').text('');
    }
  });

  $(this.el).find('.play').click(function(){
    self.play();
  });

  $(this.el).find('.pause').click(function(){
    $(self.el).trigger('cancelBuffering');
    self.pause();    
  });

  $(this.el).find('.stop').click(function(){
    $(self.el).trigger('cancelBuffering');
    self.stop();
  });

  /* Fullscreen logic */
  $(this.el).find('.go-fullscreen').click(function(){
    var elem = self.video;//
    if (elem.requestFullscreen){
      elem.requestFullscreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    }
  });

  $(this.el).find('.go-small').click(function(){
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }    
  });

  if (document.addEventListener){
      document.addEventListener('webkitfullscreenchange', fullScreenHandler, false);
      document.addEventListener('mozfullscreenchange', fullScreenHandler, false);
      document.addEventListener('fullscreenchange', fullScreenHandler, false);
      document.addEventListener('MSFullscreenChange', fullScreenHandler, false);
  }

  function fullScreenHandler(){
    if (document.fullscreen || document.webkitIsFullScreen || document.mozFullScreen || document.msFullscreenElement) { 
        $(self.el).find('.go-fullscreen').hide();
        $(self.el).find('.go-small').show();
        $(self.el).find('input').css('width', $(window).width()-130).css('margin-left','20px');
        $(self.el).find('.media-controls').css('color', '#EEE').css('left','5px');
        $(self.el).find('.loading-bar').css('width', $(window).width());
      }
      else{
        $(self.el).find('.go-small').hide();
        $(self.el).find('.go-fullscreen').show();
        $(self.el).find('input').css('width', self.width-125).css('margin-left','20px');
        $(self.el).find('.media-controls').css('color', '#333').css('left','0');
        $(self.el).find('.loading-bar').css('width', self.width);
      }
  }
};

DashClient.prototype.startLoadingBar = function(duration){
  var progressEl = $(this.el).find('.current-loading');
  var progress = 0;
  var INTERVAL = 25;
  $(progressEl).css('width','0%');
  $(progressEl).parent().show();
  var timer = setInterval(function(){
    progress+= INTERVAL * 100 / duration;
    if(progress >= 100){
      clearInterval(timer);
      progress = 100;
      $(progressEl).parent().hide();
    }
    $(progressEl).css('width',progress+'%');
  }, INTERVAL);

}

//time update listener
DashClient.prototype.onTimeUpdate = function(currentTime){
  //console.log(currentTime);
  $(this.el).find('input').val(currentTime);
  var minutes = Math.floor(currentTime / 60);
  if(minutes < 10) minutes= "0"+minutes;
  var seconds = Math.floor(currentTime % 60);
  if(seconds < 10) seconds = "0"+seconds;
  var vs=null;
  $(this.el).find('.current-time').text(minutes+':'+seconds);
  if(currentTime > this.length){
    $(this.el).trigger('finished',[parseInt(currentTime)]);
    return;
  }
  for(var i in this.videoSequence){
    if(!this.videoSequence[i].jumped && currentTime >= this.videoSequence[i].from){
      this.videoSequence[i].jumped = true;
      if(this.videoSequence[i].id === this.BUFFERING){
        $(this.el).trigger('videoBuffering', [this.videoSequence[i].bufferingTime]);
        return;
      }
      vs = this.videoSequence[i];//.uid;
    }
  }
  //console.log('THERE ARE CHANGE?', vs, this.currentVideoRep);
  if(vs && vs.id !== this.currentVideoRep){
    console.log('Video jump to:', vs.id, ', At Time', currentTime.toFixed(2) + ' [Sec]');
    $(this.el).trigger('videoJump',[vs.id]);
  }
  var as = null;
  for(var i in this.audioSequence){
    if(!this.audioSequence[i].jumped && currentTime >= this.audioSequence[i].from){
      this.audioSequence[i].jumped = true;
      as = this.audioSequence[i];//.uid;
      //sequenceID.push(this.audioSequence[i].uid);
    }
  }
  if(as && as.id !== this.currentAudioRep){
    console.log('Audio jump to:', as.id, ', At Time', currentTime.toFixed(2) + ' [Sec]');
    $(this.el).trigger('audioJump',[as.id]);
  }
}
//VIDEO SEQUENCE PARSER
DashClient.prototype.getSequence = function(callback){
  var self = this;
  var videoSequence = this.sequence.split(';');
  if(this.a_sequence)
    var audioSequence = this.a_sequence.split(';');;
  var counter = 0;
  
  var ticks = [];
  var s = videoSequence.filter(function(seg){if(parseInt(seg)){return true}});
  for(var i = 0; i < s.length; i++){
    if(i > 0){
      if(s[i]!== s[i-1])
        ticks.push(i);
    }
  }
  videoSequence.forEach(function(segment){
    if(parseInt(segment)){
      var vs = null;
      for(var i in self.videoSequence){
        if(self.videoSequence[i].id === segment){
          vs = self.videoSequence[i];
          break;
        }
      }

      self.videoSequence.push({
        index: counter++,
        id: segment,
        uid: vs ? vs.uid : generateRandomID()
      });
    }
    else{
      self.videoSequence.push({
        index: counter,
        bufferingTime: parseFloat(segment.split('w')[1]),
        id: self.BUFFERING,
        uid: generateRandomID()
      });
      //self.ticks.push(self.videoSequence[self.videoSequence.length - 1].bufferingTime)  
    }
  });

  counter = 0;
  if(this.a_sequence){
    audioSequence.forEach(function(segment){
      if(parseInt(segment)){
        var as = null;
        for(var i in self.audioSequence){
          if(self.audioSequence[i].id === segment){
            as = self.audioSequence[i];
            break;
          }
        }

        self.audioSequence.push({
          index: counter++,
          id: segment,
          uid: as ? as.uid : generateRandomID()
        });
      }
    });
  }
  else
    self.audioSequence = [{from: 0, id: "140", uid: generateRandomID() }]; /** ADD DEFAULT AUDIO*/
  self.setEvents();
  callback(self.videoSequence, self.audioSequence, ticks); 
};


DashClient.prototype.getSequenceByUID = function(UID){
  for(var i in this.videoSequence){
    if(UID === this.videoSequence[i].uid)
      return this.videoSequence[i];
  }
  for(var i in this.audioSequence){
    if(UID === this.audioSequence[i].uid)
      return this.audioSequence[i];
  }
  return false;
}

DashClient.prototype.getMediaByUID = function(UID){
  for(var i in this.videos){
    if(UID === this.videos[i].id)
      return this.videos[i];
  }
  for(var i in this.audios){
    if(UID === this.audios[i].id)
      return this.audios[i];
  }
  return false;
}
//MEDIA RESOURCE INITIALIZACION
DashClient.prototype.getMediaInitialization = function(mediaD, callback){
  var self = this;
  var range = mediaD.SegmentBase[0].Initialization[0].$.range;
  var url = mediaD.BaseURL[0]._;

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url , true);
  xhr.setRequestHeader("Range", 'bytes='+range);
  xhr.responseType = 'arraybuffer';

  xhr.onload = function(e){
    mediaD.initialization = this.response;
    //console.log('Initialization RANGE:', range)
    callback();
  };
  xhr.send();
}

//XHR FUNCTION FOR GET RESOURCES CHUNKS
DashClient.prototype.getVideoSegmentation = function(mediaD, callback){
  var first = false;

  if(typeof(callback) !== 'function')
    callback = mediaD;
  if(typeof(mediaD) !== 'object'){
    mediaD = this.videosData[0];
  }
  /*else{
    console.log('GETTING VIDEO SEGMENTATION')
  }*/
  var self = this;
  var range = mediaD.SegmentBase[0].$.indexRange;
  var url = mediaD.BaseURL[0]._;

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url , true);
  xhr.setRequestHeader("Range", 'bytes='+range);
  //console.log('Video segmentation range:', range);
  xhr.responseType = 'arraybuffer';

  xhr.onload = function(e){
    mediaD.segBuffer = this.response;
    mediaD.segmentation = self.parseSidx(this.response, 0);
    var chunks = mediaD.segmentation.entries.map(function(entry){ return entry.duration;})
    if(!self.videoChunks)
      self.videoChunks = chunks;
    self.getMediaInitialization(mediaD, function(){
      callback(chunks);
    });
  };
  xhr.send();
}

DashClient.prototype.getAudioSegmentation = function(mediaD, callback){
  var first = false;

  if(typeof(callback) !== 'function')
    callback = mediaD;
  if(typeof(mediaD) !== 'object'){
    mediaD = this.audiosData[0];
  }
  /*else{
    console.log('GETTING AUDIO SEGMENTATION')
  }*/
  var self = this;
  var range = mediaD.SegmentBase[0].$.indexRange;
  var url = mediaD.BaseURL[0]._;

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url , true);
  xhr.setRequestHeader("Range", 'bytes='+range);
  //console.log('Audio segmentation range:', range);
  xhr.responseType = 'arraybuffer';

  xhr.onload = function(e){
    mediaD.segBuffer = this.response;
    mediaD.segmentation = self.parseSidx(this.response, 0);
    var chunks = mediaD.segmentation.entries.map(function(entry){ return entry.duration;})
    if(!self.audioChunks)
      self.audioChunks = chunks;
    self.getMediaInitialization(mediaD, function(){
      callback(chunks);
    });
  };
  xhr.send();
}
/* Creates audio and video elements for sequences */
DashClient.prototype.buildSequence = function(){
  this.videoR = [];
  this.audioR = [];
  var videoSequence = this.videoSequence;
  var vS = [];
  var video = document.createElement("video");
  video.height = $(this.container).height() - 45;
  $(video).hide();
  $(this.el).prepend(video);
  this.video = video;
  for(var i in videoSequence){
    if(!videoSequence[i].hasOwnProperty('bufferingTime') && !this.verifyMediaOnSources(videoSequence[i].id) ){  
      this.addMediaResource(this.getRepresentationById(videoSequence[i].id)).el = video;
      this.videoR.push(this.getRepresentationById(videoSequence[i].id));
    }
    if(!videoSequence[i].hasOwnProperty('bufferingTime')){
      this.videoSequence[i].from = this.videoSequence[i].index*this.videoChunks[0] + this.videoChunks[this.videoSequence[i].index] - this.videoChunks[0];
    }
    else{
      this.videoSequence[i].from = this.videoSequence[i].index*this.videoChunks[0];
      this.ticks.push(Math.floor(this.videoSequence[i].index*this.videoChunks[0]));
    }
  }
  var audioSequence = this.audioSequence;

  var audio   = document.createElement("audio");
  this.audio  = audio;
  $(this.el).prepend(audio);

  for(var i in audioSequence){
    if(!this.verifyMediaOnSources(audioSequence[i].id)){
      this.addMediaResource(this.getRepresentationById(audioSequence[i].id)).el = audio;
      this.audioR.push(this.getRepresentationById(audioSequence[i].id)); 
    }
    this.audioSequence[i].from = this.videoSequence[i].index*this.audioChunks[0] + this.audioChunks[this.audioSequence[i].index] - this.audioChunks[0];
  }
};

DashClient.prototype.getRepresentationById =  function(id){
  var videoDataArr = this.videosData;
  for(var i in videoDataArr){
    if(videoDataArr[i].$.id === id)
      return videoDataArr[i];
  }
  var audioDataArr = this.audiosData;
  for(var i in audioDataArr){
    if(audioDataArr[i].$.id === id)
      return audioDataArr[i];
  }
  return false;
};

DashClient.prototype.addMediaResource = function(mediaD){
  this.mediaResources.push(mediaD);
  return mediaD;
};

DashClient.prototype.verifyMediaOnSources =  function(id){
  for(var i in this.mediaResources){
    if(id === this.mediaResources[i].$.id)
      return true
  }
  return false;
}

DashClient.prototype.getMediaData = function(callback){
  var self = this;
  var url = this.manifestUrl;
  $.ajax({
    datatype: 'application/json',
    url: url,
    success: function(data){
      for(var i in data){
          if(data[i].$.width)
              data[i].type= 'video';
          else
              data[i].type = 'audio';
      }
      self.audiosData = data.filter(function(item){if(!item.$.width) return true;})
      self.videosData = data.filter(function(item){if(item.$.width) return true;});
      callback(self.audiosData, self.videosData);
    }
  });
};

DashClient.prototype.getMediaLength =  function(url, callback){
  $.ajax({
      method: 'HEAD',
      url: url,
      success: function(message, text, response){
        var srcLength = parseInt(response.getResponseHeader('Content-Length'));
        callback(parseInt(srcLength));
      }
  });
};

DashClient.prototype.startBufferDownload = function(ms, type){
  var rep = type ==='audio' ? this.audioR[0] : this.videoR[0];
  var mimeCodec     = rep.mimeType+';codecs="'+rep.$.codecs+'"'; 
  var sourceBuffer  = ms.addSourceBuffer(mimeCodec);
  //sourceBuffer.addEventListener('update', function(e) { console.log('Buffer update: ' + ms.readyState); });
  var self = this;
  sourceBuffer.queue = [];
  sourceBuffer.addEventListener('updateend', function(e) {        
    if (sourceBuffer.queue.length) {
      sourceBuffer.appendBuffer(sourceBuffer.queue.shift());
    }
  });      

    var VISIBLE_CHUNKS = Math.ceil(this.length / this.videoChunks[0]);    

    var sequence = type ==='audio' ? this.audioSequence : this.videoSequence;

    sequence = sequence.filter(function(s){return (s.id !== 'BUFFERING') ? true : false;});
    var reader = {};

    reader.onload = function(resp, id, i) {
      if (sourceBuffer.updating) {
        sourceBuffer.queue.push(resp);
        return;
      }
      try{
        sourceBuffer.appendBuffer(resp);
      }
      catch(e){
        console.error(e);
      }
    };
    
    var i = 0;

    var init = null;
    getSegment(i);
    function getSegment(i){

      if(!sequence[i])
        return;
      var mediaD = self.getRepresentationById(sequence[i].id);
      var mediaURL      = mediaD.BaseURL[0]._;
      //var initBytesOffset = parseInt(mediaD.SegmentBase[0].Initialization[0].$.range.split('-')[1]);
      var segmentBytesOffset = parseInt(mediaD.SegmentBase[0].$.indexRange.split('-')[1]);
      if(self.state === 'DESTROYED' || i === VISIBLE_CHUNKS){
        console.log('The representation downloading has been stoped:', mediaD.$.id)
        return;
      }

      if(i === 1)
        $(self.el).trigger('bufferReady');

      if (i === self.videoChunks.length - 1) {
        console.log('Representation download finished:', mediaD.$.id);
        return;
      }
      var segment = mediaD.segmentation.entries[i];
      if(init !== mediaD.$.id){
        init = mediaD.$.id;
        reader.onload(mediaD.initialization,  i, type+" INIT");
      }

      var segment   = mediaD.segmentation.entries[i];
      var startByte = segment.start + segmentBytesOffset + 1;
      var endByte   = startByte + segment.length - 1;

      var range_req = 'bytes=' + startByte + '-' + endByte;
      //console.log('RANGE', i, type, mediaD.$.id, range_req);
      var xhr = new XMLHttpRequest();
      xhr.responseType = 'arraybuffer';
      xhr.open('GET', mediaURL , true);
      xhr.setRequestHeader("Range", range_req);

      xhr.onload = function(e){
        reader.onload( new Uint8Array(this.response), i, type+" "+range_req+" "+segment.timeOffset);        
        getSegment(++i);
      };
      xhr.send();
    }  
};

//PARSING RESOURCE HEADER INFORMATION
DashClient.prototype.parseSidx = function(ab, sidxStart) {
  var d = new DataView(ab);
  var pos = 0;

  var sidxEnd = d.getUint32(0, false);

  var version = d.getUint8(pos + 8);
  pos += 12;

  // Skip reference_ID(32)

  var timescale = d.getUint32(pos + 4, false);
  pos += 8;

  var earliestPts;
  var firstOffset;
  if (version == 0) {
    earliestPts = d.getUint32(pos, false);
    firstOffset = d.getUint32(pos + 4, false);
    pos += 8;
  } else {
    earliestPts =
        (d.getUint32(pos, false) << 32) + d.getUint32(pos + 4, false);
    firstOffset =
        (d.getUint32(pos + 8, false) << 32) + d.getUint32(pos + 12, false);
    pos += 16;
  }

  firstOffset += sidxEnd + sidxStart;
  //this.setFirstSegmentStart(firstOffset, earliestPts);

  // Skip reserved(16)
  var referenceCount = d.getUint16(pos + 2, false);
  pos += 4;
  var entries = [];
  var lenCoun = 0;
  var timeOffset = 0;
  for (var i = 0; i < referenceCount; i++) {

    var length = d.getUint32(pos, false);
    
    var duration = d.getUint32(pos + 4, false);
    pos += 12;

    var params = {
      length: length,
      duration: duration/timescale,
      start: lenCoun,
      timeOffset: timeOffset
    }
    entries.push(params);
    lenCoun += length;
    timeOffset += entries[entries.length - 1].duration;
  }
  return {
    timeScale: timescale,
    version: version,
    referenceCount: referenceCount,
    earliestPts: earliestPts,
    firstOffset: firstOffset,
    entries: entries
  }
};

DashClient.prototype.getSidxs = function(callback){
  var self = this;
  var c = 0;
  var tm = self.videoR.length + self.audioR.length;
  for(var i in self.audioR){
    self.getAudioSegmentation(self.audioR[i], function(){
      if(++c === tm){
        callback(self.audioR, self.videoR);
      }
    });
  }

  for(var i in self.videoR){
    self.getVideoSegmentation(self.videoR[i], function(){
      if(++c === tm){
        callback(self.audiosData, self.videoR);
      }
    });
  }
}

DashClient.prototype.buildHTML = function(container){
  var el = document.createElement('div');
  el.id ="video-popup";
  var width = $(container).width()+30;
  var height = $(container).height();

  window.MediaSource = window.MediaSource || window.WebKitMediaSource;
  if(window.MediaSource){
    $(el).html(
      '<div class="media-controls" style="display:none">'+
        '<span class="glyphicon glyphicon-play play"></span>'+
        '<span class="glyphicon glyphicon-pause pause" style="display:none"></span>'+
        '<span class="glyphicon glyphicon-stop stop"></span>'+
        '<input type="range" style="width: 80%; display:inline-block" value ="0" step="0.01">'+
        '<span class="current-time">  00:00</span>'+
        '<span class="glyphicon glyphicon-fullscreen go-fullscreen" style="margin-left: 5px;"></span>'+
        '<span class="glyphicon glyphicon-resize-small go-small" style="margin-left: 5px; display:none"></span>'+
      '</div>'+
      '<div class="media-information">'+
        '<div class="video-info"></div>'+
        '<div class="audio-info"></div>'+
        '<div class="loading-info"></div>'+
      '</div>'+
      '<div class="loading-bar">'+
        '<div class="current-loading"></div>'+
      '</div>'
    );
    $(el).find('.current-time').css('margin-left','15px');
    this.compatible = true;
  }
  else{
    $(el).html('This browser does not support Media Source Extensions playback.');
    this.compatible = false
  }
  this.el = el;
  $(container).append(this.el);
}

DashClient.prototype.init = function(){
  var self = this
  this.getSequence(function(vs,as, ticks){
   // console.log('SEQUENCE', sequence)
    self.getMediaData(function(audios, videos){
     // console.log('AUDIOS & VIDEOS', audios, videos);
      self.getVideoSegmentation(function(videoChunks){
        self.getAudioSegmentation(function(audioChunks){
        //console.log('CHUNKS',videoChunks);
          self.buildSequence();
          self.ticks = self.ticks.concat(ticks.map(  function(t){return Math.round( t*videoChunks[0]  )}  )).sort();
          self.getSidxs(function(){
            console.log('Preparing media sources');
            self.msVideo = new MediaSource();
            self.video.src  = window.URL.createObjectURL( self.msVideo);
            self.msVideo.addEventListener('sourceopen', function(){ self.startBufferDownload.call(self, this, 'video'); });           
            self.audio.src  = window.URL.createObjectURL( self.msVideo);
            self.msVideo.addEventListener('sourceopen', function(){ self.startBufferDownload.call(self, this, 'audio'); }); 
          });
        });
      });
    });
  });
}


//MAIN EVENTS
DashClient.prototype.destroy = function(){
  console.log('DESTROYING DASH PLAYER', this);
  this.state = 'DESTROYED';
  this.video.src = "";
  this.audio.src = "";
}

DashClient.prototype.play = function(){
  if(this.state === 'STOPED'){ //prevent play on start when there are buffering
    this.stop();
  }
  if(this.state === 'BUFFERING_ON_PLAY'){
    this.state = 'PLAYING';
    $(this.el).trigger('videoBuffering',[this.bufferingTime]);
  }
  else{
    $(this.el).find('.play').hide();
    $(this.el).find('.pause').show();
    this.audio.play();
    this.video.play();
    this.state = "PLAYING";
  }
};

DashClient.prototype.pause = function(){
  $(this.el).find('.pause').hide();
  $(this.el).find('.play').show();
  this.video.pause();
  this.audio.pause();
  this.state = "PAUSED";
};
DashClient.prototype.stop = function(){  
  $(this.el).find('.pause').hide();
  $(this.el).find('.play').show();
  $(this.el).find('.loading-bar').hide();
  this.video.pause();
  this.audio.pause();
  this.video.currentTime = 0;
  this.audio.currentTime = 0;
  /* ERASE JUMPED MARKS*/
  this.videoSequence.map(function(video){video.jumped = false; })
  this.audioSequence.map(function(audio){audio.jumped =  false;})
  this.state = "STOPED";
};

DashClient.prototype.setCurrentTime = function(currentTime){
  this.video.currentTime = currentTime;
  this.audio.currentTime = currentTime;
}

DashClient.prototype.setVolume = function(volume){
  this.volume;
  this.audios.map(function(audio){ audio.volume = volume; });
};

function generateRandomID(){
    var d = new Date().getTime();
    var uuid = 'xxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random()*16)%16 | 0;
        d = Math.floor(d/16);
        return (c=='x' ? r : (r&0x3|0x8)).toString(16);
    });
    return uuid;
};