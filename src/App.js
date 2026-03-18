import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Row, Col, Form, Button, Card, Spinner, Dropdown, Modal, ListGroup } from 'react-bootstrap';
import axios from 'axios';
import ReactPlayer from 'react-player';
import { FaPlay, FaPause, FaDownload, FaMusic, FaChevronDown, FaChevronUp, FaGithub, FaStepForward, FaStepBackward, FaList, FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';


const API_BASE = process.env.REACT_APP_API_BASE || '/api';


const Github = () => {
  return (
    <a
      href="https://github.com/lovebai/cl-music"
      target="_blank"
      rel="noopener noreferrer"
      className="github-corner"
      aria-label="View source on GitHub"
    >
      <FaGithub
        size={32}
        className="text-dark"
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          transition: 'transform 0.3s ease'
        }}
      />
    </a>
  )
}

const MusicSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [source, setSource] = useState('netease');
  const [quality, setQuality] = useState('999');
  const [loading, setLoading] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playerUrl, setPlayerUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef(null);
  const [coverCache, setCoverCache] = useState({});
  const [lyricData, setLyricData] = useState({
    rawLyric: '',
    tLyric: '',
    parsedLyric: []
  });
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const [lyricExpanded, setLyricExpanded] = useState(false);
  const lyricsContainerRef = useRef(null);

  // 👇 【修改1】使用 localStorage 初始化播放列表，确保刷新不丢失
  const [playlist, setPlaylist] = useState(() => {
    try {
      const saved = localStorage.getItem('my_music_playlist');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  
  const [playlistIndex, setPlaylistIndex] = useState(0);
  const [showPlaylist, setShowPlaylist] = useState(false); // 控制列表弹窗显示

  // 👇 【修改1】添加新的 useEffect，每当列表变化时自动保存到浏览器
  useEffect(() => {
    localStorage.setItem('my_music_playlist', JSON.stringify(playlist));
  }, [playlist]);


  const sources = [
    'netease', 'joox', 'tencent', 'tidal', 'spotify',
    'ytmusic', 'qobuz', 'deezer',
    'migu', 'kugou', 'kuwo', 'ximalaya'
  ];

  const qualities = ['128', '192', '320', '740', '999'];

  const parseLyric = (text) => {
    const lines = text.split('\n');
    const pattern = /\[(\d+):(\d+\.\d+)\]/;

    return lines.map(line => {
      const match = line.match(pattern);
      if (match) {
        const minutes = parseFloat(match[1]);
        const seconds = parseFloat(match[2]);
        return {
          time: minutes * 60 + seconds,
          text: line.replace(match[0], '').trim()
        };
      }
      return null;
    }).filter(Boolean);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query) return;

    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}`, {
        params: {
          types: 'search',
          source: source,
          name: query,
          count: 20,
          pages: 1
        }
      });
      // 获取结果后处理封面
      const resultsWithCover = await Promise.all(
        response.data.map(async track => ({
          ...track,
          picUrl: await fetchCover(track.source, track.pic_id)
        }))
      );

      setResults(resultsWithCover);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('搜索失败，请稍后重试', {
        icon: '❌',
        className: 'custom-toast error-toast'
      });
    }
    setLoading(false);
  };


  const fetchCover = async (source, picId, size = 300) => {
    const cacheKey = `${source}-${picId}-${size}`;

    if (coverCache[cacheKey]) return coverCache[cacheKey];

    try {
      const response = await axios.get(`${API_BASE}`, {
        params: {
          types: 'pic',
          source: source,
          id: picId,
          size: size
        }
      });

      const url = response.data.url.replace(/\\/g, '');
      setCoverCache(prev => ({ ...prev, [cacheKey]: url }));
      return url;
    } catch (error) {
      console.error('封面获取失败:', error);
      return 'default_cover.jpg';
    }
  };

  const handlePlay = async (track) => {
    if (currentTrack?.id === track.id) {
      setIsPlaying(!isPlaying);
      return;
    }

    try {
      const [urlResponse, lyricResponse] = await Promise.all([
        axios.get(API_BASE, {
          params: { types: 'url', source: track.source, id: track.id, br: quality }
        }),
        axios.get(API_BASE, {
          params: { types: 'lyric', source: track.source, id: track.lyric_id }
        })
      ]);

      const rawLyric = lyricResponse.data.lyric || '';
      const tLyric = lyricResponse.data.tlyric || '';

      setLyricData({
        rawLyric,
        tLyric,
        parsedLyric: parseLyric(rawLyric)
      });

      setPlayerUrl('');
      setIsPlaying(false);

      const response = await axios.get(`${API_BASE}`, {
        params: {
          types: 'url',
          source: track.source,
          id: track.id,
          br: quality
        }
      });

      const url = response.data?.url?.replace(/\\/g, '');
      if (!url) throw new Error('无效的音频链接');

      setCurrentTrack(track);
      setPlayerUrl(url);
      setIsPlaying(true);

    } catch (error) {
      console.error('Play error:', error);
      toast.warning('当前音频无效不可用', {
        icon: '⚠️',
        className: 'custom-toast warning-toast'
      });
    }
  };

  const useThrottle = (callback, delay) => {
    const lastCall = useRef(0);
    return useCallback((...args) => {
      const now = new Date().getTime();
      if (now - lastCall.current >= delay) {
        lastCall.current = now;
        callback(...args);
      }
    }, [callback, delay]);
  };

  const handleProgress = useThrottle((state) => {
    const currentTime = state.playedSeconds;
    const lyrics = lyricData.parsedLyric;

    let newIndex = -1;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTime >= lyrics[i].time) {
        newIndex = i;
        break;
      }
    }

    if (newIndex !== currentLyricIndex) {
      setCurrentLyricIndex(newIndex);
    }
  }, 500);

  const handleDownload = async (track) => {
    try {
      const response = await axios.get(`${API_BASE}`, {
        params: {
          types: 'url',
          source: track.source,
          id: track.id,
          br: quality
        }
      });

      const downloadUrl = response.data.url.replace(/\\/g, '');
      const link = document.createElement('a');
      link.href = downloadUrl;
      const extension = getFileExtension(downloadUrl);
      link.download = `${track.name} - ${track.artist}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      toast.error('下载失败，请稍后重试');
    }
  };

  const getFileExtension = (url) => {
    try {
      const cleanUrl = url.replace(/\\/g, '');
      const fileName = new URL(cleanUrl).pathname.split('/').pop().split(/[#?]/)[0];
      const extensionMatch = fileName.match(/\.([a-z0-9]+)$/i);
      return extensionMatch ? extensionMatch[1] : 'audio';
    } catch {
      return 'audio';
    }
  };

  // 播放列表操作
  const addToPlaylist = (track) => {
    // 防止重复添加
    const exists = playlist.some(t => t.id === track.id && t.source === track.source);
    if(exists) {
      toast.info('这首歌已经在列表里了');
      return;
    }
    setPlaylist([...playlist, track]);
    toast.success(`已添加: ${track.name}`, { autoClose: 1500 });
  };

  const playNext = () => {
    if (playlist.length === 0) return;
    let nextIndex = playlistIndex + 1;
    if (nextIndex >= playlist.length) nextIndex = 0;

    setPlaylistIndex(nextIndex);
    handlePlay(playlist[nextIndex]);
  };

  const playPrev = () => {
    if (playlist.length === 0) return;
    let prevIndex = playlistIndex - 1;
    if (prevIndex < 0) prevIndex = playlist.length - 1;

    setPlaylistIndex(prevIndex);
    handlePlay(playlist[prevIndex]);
  };

  const playFromPlaylist = (index) => {
    setPlaylistIndex(index);
    handlePlay(playlist[index]);
    setShowPlaylist(false); // 选歌后关闭窗口
  };

  const removeFromPlaylist = (e, index) => {
    e.stopPropagation();
    const newPlaylist = playlist.filter((_, i) => i !== index);
    setPlaylist(newPlaylist);

    if (index === playlistIndex) {
      setIsPlaying(false);
      setCurrentTrack(null);
      setPlayerUrl('');
    } else if (index < playlistIndex) {
      setPlaylistIndex(playlistIndex - 1);
    }
  };

  useEffect(() => {
    if (lyricExpanded && currentLyricIndex >= 0 && lyricsContainerRef.current) {
      const activeLines = lyricsContainerRef.current.getElementsByClassName('active');
      if (activeLines.length > 0) {
        activeLines[0].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }
  }, [currentLyricIndex, lyricExpanded]);


  return (
    <Container className="my-4"
      style={{
        paddingBottom: lyricExpanded ? '320px' : '120px',
        transition: 'padding 0.3s ease'
      }}
    >
      <Github />
      <h1 className="text-center mb-4">全平台音乐搜索</h1>

      <Form onSubmit={handleSearch} className="mb-4">
        <Row className="g-2">
          <Col md={5}>
            <Form.Control
              type="search"
              placeholder="输入歌曲名、歌手或专辑"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Col>
          <Col md={3}>
            <Form.Select value={source} onChange={(e) => setSource(e.target.value)}>
              {sources.map(src => (<option key={src} value={src}>{src.toUpperCase()}</option>))}
            </Form.Select>
          </Col>
          <Col md={2}>
            <Dropdown>
              <Dropdown.Toggle variant="outline-secondary">音质: {quality}k</Dropdown.Toggle>
              <Dropdown.Menu>
                {qualities.map(q => (<Dropdown.Item key={q} onClick={() => setQuality(q)}>{q}k</Dropdown.Item>))}
              </Dropdown.Menu>
            </Dropdown>
          </Col>
          <Col md={2}>
            <Button variant="primary" type="submit" className="w-100">搜索</Button>
          </Col>
        </Row>
      </Form>

      {loading && (<div className="text-center my-4"><Spinner animation="border" /></div>)}

      <Row className="g-4">
        {results.map((track) => (
          <Col key={track.id} md={6} lg={4}>
            <Card>
              <Card.Body>
                <div className="d-flex align-items-center">
                  <img
                    src={track.picUrl || 'default_cover.jpg'}
                    alt="封面"
                    className="me-3 rounded"
                    style={{ width: '60px', height: '60px', objectFit: 'cover', backgroundColor: '#f5f5f5' }}
                    onError={(e) => { e.target.src = 'default_cover.png'; }}
                  />
                  <div>
                    <h6 className="mb-1">{track.name}</h6>
                    <small className="text-muted">{track.artist} - {track.album}</small>
                  </div>
                </div>

                <div className="mt-2 d-flex justify-content-end">
                  <Button
                    variant="outline-primary" size="sm" style={{ marginRight: '5px' }}
                    onClick={() => handlePlay(track)}
                  >
                    {isPlaying && currentTrack?.id === track.id ? <FaPause /> : <FaPlay />}
                  </Button>

                  <Button
                    variant="outline-secondary" size="sm" style={{ marginRight: '5px' }}
                    onClick={() => addToPlaylist(track)} title="添加到列表"
                  >
                    +
                  </Button>

                  <Button variant="outline-success" size="sm" onClick={() => handleDownload(track)}>
                    <FaDownload />
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 底部播放器 */}
      <div className="fixed-bottom bg-light p-3 border-top shadow"
        style={{ height: lyricExpanded ? '300px' : 'auto', zIndex: 1000 }}
      >
        <Row className="align-items-center">
          <Col md={3}>
            <div className="d-flex ">
              {currentTrack && (
                <div className="d-flex align-items-center">
                  <img
                    src={coverCache[`${currentTrack.source}-${currentTrack.pic_id}-300`] || 'default_cover.png'}
                    alt="当前播放"
                    style={{ width: '50px', height: '50px' }} className="me-2 rounded"
                  />
                  <div>
                    <h6 className="mb-0">{currentTrack.name}</h6>
                    <small className="text-muted">{currentTrack.artist}</small>
                  </div>
                </div>
              )}
              <Button variant="link" onClick={() => setLyricExpanded(!lyricExpanded)} className="ms-2" title="歌词">
                {lyricExpanded ? <FaChevronDown /> : <FaChevronUp />}
              </Button>
            </div>
          </Col>

          <Col md={6}>
            <div className={`lyric-container ${lyricExpanded ? 'expanded' : 'collapsed'}`}
              style={{ maxHeight: lyricExpanded ? '400px' : '60px', transition: 'max-height 0.3s ease' }}>
              <div className="lyric-wrapper">
                {lyricData.parsedLyric[currentLyricIndex] && (
                  <div className="current-lyric">
                    {lyricData.parsedLyric[currentLyricIndex].text}
                    {lyricData.tLyric && (
                      <div className="translated-lyric">{parseLyric(lyricData.tLyric)[currentLyricIndex]?.text}</div>
                    )}
                  </div>
                )}
                {lyricExpanded && (
                  <div className="full-lyrics" ref={lyricsContainerRef}>
                    {lyricData.parsedLyric.map((line, index) => (
                      <div key={index} className={`lyric-line ${index === currentLyricIndex ? 'active' : ''}`}>
                        <div>{line.text}</div>
                        {lyricData.tLyric && (<div className="translated-lyric">{parseLyric(lyricData.tLyric)[index]?.text}</div>)}
                      </div>
                    ))}
                    {lyricData.parsedLyric.length === 0 && (<div className="text-center text-muted py-3">暂无歌词</div>)}
                  </div>
                )}
                {lyricData.parsedLyric.length === 0 && <div className="current-lyric">暂无歌词</div>}
              </div>
            </div>
            <ReactPlayer
              ref={playerRef} onProgress={handleProgress} url={playerUrl} playing={isPlaying}
              onReady={() => console.log('ready')}
              onError={() => { setIsPlaying(false); }}
              onEnded={playNext}
              config={{ file: { forceAudio: true } }} height={0}
              style={{ display: playerUrl ? 'block' : 'none' }}
            />
          </Col>

          <Col md={3} className="text-end d-flex align-items-center justify-content-end gap-2">
            <Button variant="link" onClick={playPrev} disabled={playlist.length === 0} title="上一首">
              <FaStepBackward size={20} className={playlist.length > 0 ? "text-dark" : "text-muted"} />
            </Button>

            <Button variant="link" onClick={() => setIsPlaying(!isPlaying)} disabled={!currentTrack || !playerUrl}>
              {!currentTrack ? (
                <FaMusic size={28} className="text-muted" />
              ) : isPlaying ? (
                <FaPause size={28} />
              ) : (
                <FaPlay size={28} />
              )}
            </Button>

            <Button variant="link" onClick={playNext} disabled={playlist.length === 0} title="下一首">
              <FaStepForward size={20} className={playlist.length > 0 ? "text-dark" : "text-muted"} />
            </Button>

            {/* 👇 【修改2】非常明显的列表按钮，蓝色背景带计数器 */}
            <Button 
                variant="primary" 
                className="rounded-pill px-3" 
                onClick={() => setShowPlaylist(true)} 
                title="查看播放列表"
            >
               <FaList /> <span className="fw-bold">{playlist.length}</span>
            </Button>
          </Col>
        </Row>
      </div>

      {/* 播放列表弹窗 */}
      <Modal show={showPlaylist} onHide={() => setShowPlaylist(false)} centered scrollable size="lg">
        <Modal.Header closeButton>
          <Modal.Title>播放列表 ({playlist.length})</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: '0' }}>
          {playlist.length === 0 ? (
            <div className="text-center text-muted py-4">列表为空，快去添加歌曲吧！</div>
          ) : (
            <ListGroup variant="flush">
              {playlist.map((track, index) => (
                <ListGroup.Item
                  key={index}
                  active={currentTrack?.id === track.id && currentTrack?.source === track.source}
                  action
                  onClick={() => playFromPlaylist(index)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    padding: '12px 20px',
                    background: (currentTrack?.id === track.id && currentTrack?.source === track.source) ? '#e9ecef' : 'white'
                  }}
                >
                  <div style={{ flex: 1, overflow: 'hidden', marginRight: '10px' }}>
                    <div style={{ fontWeight: (currentTrack?.id === track.id) ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {index + 1}. {track.name}
                    </div>
                    <small className="text-muted">{track.artist}</small>
                  </div>
                  <Button
                    variant="link"
                    className="text-danger p-0"
                    onClick={(e) => removeFromPlaylist(e, index)}
                    title="移除"
                  >
                    <FaTimes />
                  </Button>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </Modal.Body>
      </Modal>

    </Container>
  );
};

export default MusicSearch;
