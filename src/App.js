import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Row, Col, Form, Button, Card, Spinner, Dropdown, Modal, ListGroup, Alert } from 'react-bootstrap';
import axios from 'axios';
import ReactPlayer from 'react-player';
import { FaPlay, FaPause, FaDownload, FaGithub, FaChevronDown, FaChevronUp, FaStepForward, FaStepBackward, FaList, FaTimes, FaCog, FaCloud, FaSync } from 'react-icons/fa';
import { toast } from 'react-toastify';

// 🌥️ V5 特性：集成 Cloudflare KV 云同步
const APP_VERSION = "V5 - KV云同步版";

// 这里填你上面部署的 Worker 地址
const API_BASE = process.env.REACT_APP_API_BASE || '/api'; 

const Github = () => (
  <a href="https://github.com/lovebai/cl-music" target="_blank" rel="noopener noreferrer" className="github-corner" aria-label="View source on GitHub">
    <FaGithub size={32} className="text-dark" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000 }} />
  </a>
);

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
  const [lyricData, setLyricData] = useState({ rawLyric: '', tLyric: '', parsedLyric: [] });
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const [lyricExpanded, setLyricExpanded] = useState(false);
  const lyricsContainerRef = useRef(null);

  // 核心状态：本地歌单（与云端同步后作为本地缓存）
  const [playlist, setPlaylist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cl_music_playlist_v5') || '[]'); } 
    catch { return []; }
  });
  
  const [playlistIndex, setPlaylistIndex] = useState(0);
  
  // V5 新增状态
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [syncKey, setSyncKey] = useState(''); // 用户输入的同步密码
  const [isSyncing, setIsSyncing] = useState(false); // 正在同步动画

  // 1. 加载时读取本地保存的 Key
  useEffect(() => {
    const savedKey = localStorage.getItem('cl_music_sync_key_v5');
    if (savedKey) {
      setSyncKey(savedKey);
      fetchFromCloud(savedKey); // 有 Key 自动拉取
    }
  }, []);

  // 2. 自动保存到本地（作为缓存）
  useEffect(() => {
    localStorage.setItem('cl_music_playlist_v5', JSON.stringify(playlist));
  }, [playlist]);

  // 3. 核心：监听 playlist 变化，如果有 syncKey，自动推送到云端
  useEffect(() => {
    let timer;
    if (syncKey.trim()) {
      timer = setTimeout(() => pushToCloud(playlist), 1000); // 防抖，停止修改1秒后上传
    }
    return () => clearTimeout(timer);
  }, [playlist, syncKey]);

  const sources = ['netease', 'joox', 'tencent', 'tidal', 'spotify', 'ytmusic', 'qobuz', 'deezer', 'migu', 'kugou', 'kuwo', 'ximalaya'];
  const qualities = ['128', '192', '320', '740', '999'];

  const parseLyric = (text) => {
    const lines = text.split('\n');
    const pattern = /\[(\d+):(\d+\.\d+)\]/;
    return lines.map(line => {
      const match = line.match(pattern);
      if (match) {
        const minutes = parseFloat(match[1]);
        const seconds = parseFloat(match[2]);
        return { time: minutes * 60 + seconds, text: line.replace(match[0], '').trim() };
      }
      return null;
    }).filter(Boolean);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query) return;
    setLoading(true);
    try {
      const response = await axios.get(API_BASE, { params: { types: 'search', source, name: query, count: 20, pages: 1 } });
      const resultsWithCover = await Promise.all(
        response.data.map(async track => ({
          ...track,
          picUrl: await fetchCover(track.source, track.pic_id)
        }))
      );
      setResults(resultsWithCover);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('搜索失败，请检查 API_BASE 设置');
    }
    setLoading(false);
  };

  const fetchCover = async (source, picId, size = 300) => {
    const cacheKey = `${source}-${picId}-${size}`;
    if (coverCache[cacheKey]) return coverCache[cacheKey];
    try {
      const response = await axios.get(API_BASE, { params: { types: 'pic', source, id: picId, size } });
      const url = response.data.url?.replace(/\\/g, '');
      setCoverCache(prev => ({ ...prev, [cacheKey]: url }));
      return url;
    } catch { return 'default_cover.jpg'; }
  };

  const handlePlay = async (track) => {
    if (currentTrack?.id === track.id) { setIsPlaying(!isPlaying); return; }
    try {
      const rawData = await Promise.all([
        axios.get(API_BASE, { params: { types: 'url', source: track.source, id: track.id, br: quality } }),
        axios.get(API_BASE, { params: { types: 'lyric', source: track.source, id: track.lyric_id } })
      ]);
      const rawLyric = rawData[1].data.lyric || '';
      setLyricData({ rawLyric, tLyric: rawData[1].data.tlyric || '', parsedLyric: parseLyric(rawLyric) });
      setPlayerUrl(''); setIsPlaying(false);
      const url = rawData[0].data?.url?.replace(/\\/g, '');
      if (!url) throw new Error('无效链接');
      setCurrentTrack(track);
      setPlayerUrl(url);
      setIsPlaying(true);
    } catch { toast.warning('音频无法播放'); }
  };

  const handleProgress = useCallback((state) => {
    const currentTime = state.playedSeconds;
    const lyrics = lyricData.parsedLyric;
    let newIndex = -1;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTime >= lyrics[i].time) { newIndex = i; break; }
    }
    if (newIndex !== currentLyricIndex) setCurrentLyricIndex(newIndex);
  }, [lyricData.parsedLyric, currentLyricIndex]);

  const addToPlaylist = (track) => {
    if (playlist.some(t => t.id === track.id)) return toast.warn('已在列表中');
    setPlaylist([...playlist, track]);
    toast.success('已添加：' + track.name);
  };

  const playNext = () => {
    if (playlist.length === 0) return;
    setPlaylistIndex((playlistIndex + 1) % playlist.length);
    handlePlay(playlist[(playlistIndex + 1) % playlist.length]);
  };
  const playPrev = () => {
    if (playlist.length === 0) return;
    setPlaylistIndex((playlistIndex - 1 + playlist.length) % playlist.length);
    handlePlay(playlist[(playlistIndex - 1 + playlist.length) % playlist.length]);
  };

  // 🆕 V5: 云同步逻辑
  const fetchFromCloud = async (key) => {
    if (!key) return;
    setIsSyncing(true);
    try {
      const response = await axios.get(`${API_BASE}/sync`, { params: { key } });
      if (response.data && response.data !== "[]") {
        const cloudData = JSON.parse(response.data); // KV 返回的可能是字符串
        if (Array.isArray(cloudData)) {
          setPlaylist(cloudData);
          console.log('拉取成功');
        }
      }
    } catch (e) { console.error('同步失败', e); }
    setIsSyncing(false);
  };

  const pushToCloud = async (data) => {
    try {
      await axios.post(API_BASE + '/sync', { key: syncKey, playlist: data });
      console.log('上传成功');
    } catch (e) { console.error('上传失败', e); }
  };

  const handleSyncKeySave = (newKey) => {
    if (!newKey.trim()) {
      localStorage.removeItem('cl_music_sync_key_v5');
      setSyncKey('');
      toast.info('已关闭云同步');
      return;
    }
    localStorage.setItem('cl_music_sync_key_v5', newKey.trim());
    setSyncKey(newKey.trim());
    fetchFromCloud(newKey.trim()); // 立即拉取一次
    toast.success('已连接到云端！');
  };

  const removeFromPlaylist = (e, index) => {
    e.stopPropagation();
    const newPlaylist = playlist.filter((_, i) => i !== index);
    setPlaylist(newPlaylist);
    if (index === playlistIndex) { setIsPlaying(false); setCurrentTrack(null); setPlayerUrl(''); }
    else if (index < playlistIndex) setPlaylistIndex(playlistIndex - 1);
  };

  return (
    <Container className="my-4" style={{ paddingBottom: lyricExpanded ? '320px' : '120px' }}>
      <Github />
      <h1 className="text-center mb-4">全平台音乐搜索 {APP_VERSION}</h1>

      <Form onSubmit={handleSearch} className="mb-4">
        <Row className="g-2">
          <Col md={5}><Form.Control type="search" placeholder="歌曲名 / 歌手" value={query} onChange={e => setQuery(e.target.value)} /></Col>
          <Col md={3}>
            <Form.Select value={source} onChange={e => setSource(e.target.value)}>
              {sources.map(src => (<option key={src} value={src}>{src.toUpperCase()}</option>))}
            </Form.Select>
          </Col>
          <Col md={2}>
            <Dropdown>
              <Dropdown.Toggle variant="outline-secondary">音质: {quality}k</Dropdown.Toggle>
              <Dropdown.Menu>{qualities.map(q => (<Dropdown.Item key={q} onClick={() => setQuality(q)}>{q}k</Dropdown.Item>))}</Dropdown.Menu>
            </Dropdown>
          </Col>
          <Col md={2}><Button variant="primary" type="submit" className="w-100">搜索</Button></Col>
        </Row>
      </Form>

      {loading && (<div className="text-center my-4"><Spinner animation="border" /></div>)}

      <Row className="g-4">
        {results.map((track) => (
          <Col key={track.id} md={6} lg={4}>
            <Card>
              <Card.Body>
                <div className="d-flex align-items-center">
                  <img src={track.picUrl || 'default_cover.jpg'} alt="封面" className="me-3 rounded" style={{ width: '60px', height: '60px', objectFit: 'cover', background: '#eee' }} />
                  <div>
                    <h6 className="mb-1">{track.name}</h6>
                    <small className="text-muted">{track.artist}</small>
                  </div>
                </div>
                <div className="mt-2 d-flex justify-content-end">
                  <Button variant="outline-primary" size="sm" className="me-1" onClick={() => handlePlay(track)}>
                    {isPlaying && currentTrack?.id === track.id ? <FaPause /> : <FaPlay />}
                  </Button>
                  <Button variant="outline-secondary" size="sm" className="me-1" onClick={() => addToPlaylist(track)}>+</Button>
                  <Button variant="outline-success" size="sm"><FaDownload /></Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Player Bar */}
      <div className="fixed-bottom bg-light p-3 border-top shadow" style={{ height: lyricExpanded ? '300px' : 'auto', zIndex: 1000 }}>
        <Row className="align-items-center">
          <Col md={3}>
            <div className="d-flex align-items-center">
              {currentTrack && (
                <>
                  <img src={coverCache[`${currentTrack.source}-${currentTrack.pic_id}-300`] || 'default_cover.png'} alt="" style={{ width: '50px', height: '50px' }} className="me-2 rounded" />
                  <div>
                    <h6 className="mb-0">{currentTrack.name}</h6>
                    <small>{currentTrack.artist}</small>
                  </div>
                </>
              )}
              <Button variant="link" onClick={() => setLyricExpanded(!lyricExpanded)} className="ms-2">{lyricExpanded ? <FaChevronDown /> : <FaChevronUp />}</Button>
            </div>
          </Col>
          <Col md={6}>
            <div className={`lyric-container`} style={{ maxHeight: lyricExpanded ? '400px' : '60px', textAlign: 'center', overflow: 'hidden' }}>
              {lyricData.parsedLyric[currentLyricIndex]?.text || (lyricExpanded ? (lyricData.parsedLyric.length?"":"暂无歌词") : "")}
            </div>
            <ReactPlayer onProgress={handleProgress} url={playerUrl} playing={isPlaying} onEnded={playNext} config={{ file: { forceAudio: true } }} height={0} />
          </Col>
          <Col md={3} className="text-end d-flex align-items-center justify-content-end gap-2">
            <Button variant="link" onClick={playPrev} disabled={playlist.length === 0}><FaStepBackward size={20} className={playlist.length > 0 ? "" : "text-muted"} /></Button>
            <Button variant="link" onClick={() => setIsPlaying(!isPlaying)}>
              {!currentTrack ? <FaMusic size={28} className="text-muted" /> : isPlaying ? <FaPause size={28} /> : <FaPlay size={28} />}
            </Button>
            <Button variant="link" onClick={playNext} disabled={playlist.length === 0}><FaStepForward size={20} className={playlist.length > 0 ? "" : "text-muted"} /></Button>
            <Button variant="light" className="rounded-circle p-2" onClick={() => setShowPlaylist(true)} style={{position:'relative'}}>
               <FaList size={20}/>
               <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-warning" style={{fontSize:'0.7em'}}>{playlist.length}</span>
            </Button>
          </Col>
        </Row>
      </div>

      {/* 列表弹窗 (含V5设置) */}
      <Modal show={showPlaylist} onHide={() => setShowPlaylist(false)} centered scrollable size="lg">
        <Modal.Header closeButton>
          <Modal.Title className="w-100 d-flex justify-content-between align-items-center">
            <span>播放列表 {isSyncing && <Spinner animation="border" size="sm" />}</span>
            <Button variant="link" size="sm" onClick={() => setShowSettings(true)}><FaCog size={20}/></Button>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: '0' }}>
          {syncKey && (
            <Alert variant="info" className="mb-0 py-2 text-center small">
              <FaSync className="me-1"/> 云同步开启中 (密钥: {syncKey})
            </Alert>
          )}
          <ListGroup variant="flush">
            {playlist.map((track, index) => (
              <ListGroup.Item key={index} active={currentTrack?.id === track.id} action onClick={() => handlePlay(track)} 
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span className={currentTrack?.id === track.id ? "fw-bold text-white" : ""}>{index + 1}. {track.name}</span>
                  <div className="text-muted small">{track.artist}</div>
                </div>
                <Button variant="link text-danger p-0" onClick={(e) => removeFromPlaylist(e, index)}><FaTimes /></Button>
              </ListGroup.Item>
            ))}
            {playlist.length === 0 && <div className="text-center p-4 text-muted">列表为空</div>}
          </ListGroup>
        </Modal.Body>
      </Modal>

      {/* 设置弹窗 (V5 云同步设置) */}
      <Modal show={showSettings} onHide={() => setShowSettings(false)} centered>
        <Modal.Header closeButton><Modal.Title><FaCloud className="me-2 text-primary"/>云端同步设置</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="small text-muted">在同一个密钥下，你的所有设备将共享同一份歌单。</p>
          <Form.Group className="mb-3">
            <Form.Label>同步密钥 / 房间名</Form.Label>
            <Form.Control 
              type="text" 
              placeholder="例如: mymusic2024" 
              defaultValue={syncKey}
              ref={(input) => { if(input) input.value = syncKey; }}
              onChange={(e) => { setSyncKey(e.target.value); }} 
            />
            <Form.Text className="text-warning">
              注意：修改密钥会覆盖当前设备的列表。请确保两端密钥完全一致。
            </Form.Text>
          </Form.Group>
          <div className="d-grid gap-2">
            <Button variant="primary" onClick={() => handleSyncKeySave(document.querySelector('input[placeholder*="mymusic2024"]').value)}>
              连接 / 更换 云端
            </Button>
            <Button variant="outline-danger" onClick={() => handleSyncKeySave('')}>
              关闭云同步 (仅本地使用)
            </Button>
          </div>
        </Modal.Body>
      </Modal>

    </Container>
  );
};

export default MusicSearch;
