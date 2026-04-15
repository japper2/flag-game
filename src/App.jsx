import { use, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import "./App.css";
import Navbar from "./components/Navbar.jsx";
import Peer from "peerjs";

function App() {
  const TARGET_SCORE = 20;
  const [CountryData, setCountryData] = useState([]);
  const [GameState, SetGameState] = useState("begin");
  const [currentCountry, SetCurrentCountry] = useState({});
  const [GuessOptions, SetGuessOptions] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isCorrectGuess, setIsCorrectGuess] = useState(false);
  const [guessPending, setGuessPending] = useState(false);

  const [sessionInput, setSessionInput] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [peerId, setPeerId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([]);
  const [activeSession, setActiveSession] = useState(null);


  const gameContentRef = useRef(null);
  const peerRef = useRef(null);
  const connectionsRef = useRef({});
  const playersRef = useRef([]);

  const updatePlayers = (nextPlayers) => {
    playersRef.current = nextPlayers;
    setPlayers(nextPlayers);
  };

  const broadcastPayload = (payload) => {
    Object.values(connectionsRef.current).forEach((conn) => {
      if (conn.open) {
        conn.send(payload);
      }
    });
  };

  const sendToHost = (payload) => {
    const hostConn = connectionsRef.current[activeSession?.hostId];
    if (hostConn?.open) {
      hostConn.send(payload);
    }
  };

  const handlePeerData = (data) => {
    if (!data || typeof data !== "object" || !data.type) {
      return;
    }

    if (data.type === "playerList" && Array.isArray(data.players)) {
      updatePlayers(data.players);
    }

    if (data.type === "gameState") {
      SetGameState(data.gameState || "game");
      SetCurrentCountry(data.currentCountry || {});
      SetGuessOptions(data.options || []);
      setSelectedCountry(null);
      setHasAnswered(false);
      setIsCorrectGuess(false);
      setGuessPending(false);
      if (Array.isArray(data.players)) {
        updatePlayers(data.players);
      }
    }

    if (data.type === "guessResult" && data.playerId === peerId) {
      setSelectedCountry(data.option);
      setHasAnswered(true);
      setGuessPending(false);
      setIsCorrectGuess(Boolean(data.correct));
      if (Array.isArray(data.players)) {
        updatePlayers(data.players);
      }
    }

    if (data.type === "endGame") {
      SetGameState("end");
    }
  };

  const createGameRound = (countries) => {
    const randomIndex = getRandomIntInclusive(0, countries.length - 1);
    const correctCountry = countries[randomIndex];
    const extraOptionsTarget = 5;
    const extraCountries = [];

    while (extraCountries.length < extraOptionsTarget) {
      const randomCountry = countries[getRandomIntInclusive(0, countries.length - 1)];
      if (randomCountry !== correctCountry && !extraCountries.includes(randomCountry)) {
        extraCountries.push(randomCountry);
      }
    }

    const options = [correctCountry, ...extraCountries];

    for (let i = options.length - 1; i > 0; i--) {
      const j = getRandomIntInclusive(0, i);
      const temp = options[i];
      options[i] = options[j];
      options[j] = temp;
    }

    return { currentCountry: correctCountry, options };
  };

  const applyGameRound = ({ currentCountry, options }) => {
    SetCurrentCountry(currentCountry);
    SetGuessOptions(options);
    setSelectedCountry(null);
    setHasAnswered(false);
    setGuessPending(false);
    setIsCorrectGuess(false);
  };

  const processGuess = (playerPeerId, option, conn) => {
    const correct = option.cca3 === currentCountry.cca3;
    const nextPlayers = playersRef.current.map((player) => {
      if (player.peerId !== playerPeerId) {
        return player;
      }
      return { ...player, points: correct ? (player.points || 0) + 1 : (player.points || 0) };
    });

    updatePlayers(nextPlayers);
    broadcastPayload({ type: "playerList", players: nextPlayers });

    if (playerPeerId === peerId) {
      setSelectedCountry(option);
      setHasAnswered(true);
      setGuessPending(false);
      setIsCorrectGuess(correct);
    } else if (conn?.open) {
      conn.send({
        type: "guessResult",
        playerId: playerPeerId,
        option,
        correct,
        players: nextPlayers,
      });
    }

    const scoringPlayer = nextPlayers.find((player) => player.peerId === playerPeerId);
    if (correct && scoringPlayer?.points >= TARGET_SCORE) {
      broadcastPayload({ type: "endGame" });
      if (isHost) {
        SetGameState("end");
      }
    }
  };

  const handleIncomingConnection = (conn) => {
    const peer = conn.peer;

    conn.on("open", () => {
      connectionsRef.current[peer] = conn;

      const nextPlayers = [
        ...playersRef.current.filter((item) => item.peerId !== peer),
        { peerId: peer, points: 0 },
      ];

      updatePlayers(nextPlayers);
      broadcastPayload({ type: "playerList", players: nextPlayers });

      if (GameState === "game" && currentCountry?.cca3) {
        conn.send({
          type: "gameState",
          gameState: "game",
          currentCountry,
          options: GuessOptions,
          players: nextPlayers,
        });
      }
    });

    conn.on("data", (data) => {
      if (!data || typeof data !== "object" || !data.type) {
        return;
      }

      if (data.type === "join") {
        const nextPlayers = [
          ...playersRef.current.filter((item) => item.peerId !== data.peerId),
          { peerId: data.peerId, points: 0 },
        ];

        updatePlayers(nextPlayers);
        broadcastPayload({ type: "playerList", players: nextPlayers });

        if (GameState === "game" && currentCountry?.cca3) {
          conn.send({
            type: "gameState",
            gameState: "game",
            currentCountry,
            options: GuessOptions,
            players: nextPlayers,
          });
        }
      }

      if (data.type === "guess") {
        processGuess(data.peerId, data.option, conn);
      }
    });

    conn.on("close", () => {
      const nextPlayers = playersRef.current.filter((item) => item.peerId !== peer);
      updatePlayers(nextPlayers);
      broadcastPayload({ type: "playerList", players: nextPlayers });
      delete connectionsRef.current[peer];
    });
  };


  useEffect(() => {
    if (!activeSession || peerRef.current) {
      return;
    }

    const peer = new Peer(
      activeSession.mode === "host" ? activeSession.hostId : undefined,
    );
    peerRef.current = peer;

    connectionsRef.current = {};
    updatePlayers([]);

    peer.on("open", (id) => {
      setPeerId(id);
      setSessionId(activeSession.hostId);

      if (activeSession.mode === "host") {
        setIsHost(true);
        updatePlayers([{ peerId: id, points: 0 }]);
        return;
      }

      setIsHost(false);
      const conn = peer.connect(activeSession.hostId);

      conn.on("open", () => {
        conn.send({ type: "join", peerId: id });
      });

      conn.on("data", handlePeerData);
      conn.on("close", () => {
        delete connectionsRef.current[activeSession.hostId];
      });

      connectionsRef.current[activeSession.hostId] = conn;
    });

    peer.on("connection", (conn) => {
      if (activeSession.mode === "host") {
        handleIncomingConnection(conn);
      } else {
        conn.on("data", handlePeerData);
      }
    });

    peer.on("error", (error) => {
      console.error("PeerJS error:", error);
    });

    return () => {
      peer.destroy();
      peerRef.current = null;
      connectionsRef.current = {};
      playersRef.current = [];
      setPeerId(null);
      setIsHost(false);
      setPlayers([]);
    };
  }, [activeSession]);

  const createSession = () => {
    const newSessionId = Math.random().toString(36).substring(2, 8);
    setSessionInput(newSessionId);
    setActiveSession({ hostId: newSessionId, mode: "host" });
  };

  const joinSession = () => {
    if (!sessionInput.trim()) {
      return;
    }

    setActiveSession({ hostId: sessionInput.trim(), mode: "join" });
  };

  useEffect(() => {
    if (GameState !== "game" || !gameContentRef.current || !currentCountry?.cca3) {
      return;
    }

    gsap.fromTo(
      gameContentRef.current,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }
    );
  }, [GameState, currentCountry]);

  const GameStart = async () => {
    if (!isHost) {
      return;
    }

    try {
      let data = CountryData;
      if (data.length === 0) {
        const res = await fetch("https://restcountries.com/v3.1/all?fields=name,flags,cca3");
        data = await res.json();
        setCountryData(data);
      }

      const nextRound = createGameRound(data);
      applyGameRound(nextRound);
      SetGameState("game");
      broadcastPayload({
        type: "gameState",
        gameState: "game",
        currentCountry: nextRound.currentCountry,
        options: nextRound.options,
        players: playersRef.current,
      });
    } catch (error) {
      console.error("Failed to fetch countries:", error);
    }
  };

  function getRandomIntInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  const HandleGuess = (option) => {
    if (hasAnswered || guessPending) {
      return;
    }

    if (!peerId) {
      return;
    }

    if (isHost) {
      processGuess(peerId, option);
      return;
    }

    setSelectedCountry(option);
    setHasAnswered(true);
    setGuessPending(true);
    setIsCorrectGuess(false);
    sendToHost({ type: "guess", peerId, option });
  };

  const HandleNextFlag = () => {
    if (!isHost || CountryData.length === 0) {
      return;
    }

    const nextRound = createGameRound(CountryData);
    applyGameRound(nextRound);
    broadcastPayload({
      type: "gameState",
      gameState: "game",
      currentCountry: nextRound.currentCountry,
      options: nextRound.options,
      players: playersRef.current,
    });
  };

  const HandlePlayAgain = () => {
    if (!isHost) {
      return;
    }

    if (CountryData.length > 0) {
      GameStart();
      return;
    }

    GameStart();
  };

  const getOptionClass = (option) => {
    const baseClass = 'border rounded-md border-zinc-300 p-2'

    if (!hasAnswered) {
      return baseClass
    }

    if (option.cca3 === currentCountry.cca3) {
      return `${baseClass} bg-green-500 text-white border-green-600 anim`
    }

    if (selectedCountry?.cca3 === option.cca3) {
      return `${baseClass} bg-red-500 text-white border-red-600 anim`
    }

    return `${baseClass} opacity-70`
  }

  const myScore = players.find((player) => player.peerId === peerId)?.points ?? 0;

  return (
    <div className='min-h-screen flex flex-col overflow-hidden'>
      <Navbar score={myScore} />

      <div className="px-4 py-4 text-sm text-zinc-600">
        {!activeSession ? (
          <div className="space-y-3">
            <p>Enter a session code to join a game, or create a new session.</p>
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <input
                className="border border-zinc-300 rounded-md p-2 w-full sm:w-auto"
                type="text"
                placeholder="Enter session ID"
                value={sessionInput}
                onChange={(e) => setSessionInput(e.target.value)}
              />
              <button
                className="rounded-md bg-zinc-100 border border-zinc-300 px-4 py-2"
                onClick={createSession}
              >
                Create session
              </button>
              <button
                className="rounded-md bg-blue-500 text-white px-4 py-2 disabled:opacity-50"
                onClick={joinSession}
                disabled={!sessionInput.trim()}
              >
                Join session
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              Session code: <span className="font-mono font-bold">{sessionId}</span>
            </div>
            <div>
              {isHost ? "Host" : "Joined session"} as <span className="font-mono">{peerId || "connecting..."}</span>
            </div>
            <div>
              Players in session:{" "}
              {players.length > 0 ? (
                <ul className="list-disc list-inside">
                  {players.map((player) => (
                    <li key={player.peerId}>
                      {player.peerId} - {player.points} points
                    </li>
                  ))}
                </ul>
              ) : (
                <span>No players connected yet.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {GameState === 'begin' && activeSession && (
        <div className='flex-1 flex flex-col items-center justify-center px-4 gap-3'>
          <button
            className="border border-zinc-300 rounded-md p-2 bg-zinc-100 disabled:opacity-50"
            onClick={GameStart}
            disabled={!isHost}
          >
            Start Game
          </button>
          {!isHost && (
            <p className="text-zinc-500">Waiting for the host to start the game.</p>
          )}
        </div>
      )}

      {GameState === 'game' && (
        <div
          ref={gameContentRef}
          className='flex-1 overflow-y-auto px-4 sm:px-8 py-6 flex flex-col items-center'
        >
            <img className="border-black border w-full max-w-xs sm:max-w-sm" src={currentCountry.flags?.png} alt="Flag" />
            <h1 className='text-lg font-bold mt-8 text-center'>Which country does this flag belong to?</h1>

            <div className='w-full max-w-4xl flex-wrap justify-center gap-3 sm:gap-4 flex pt-8 sm:pt-12'>
              {GuessOptions.map((option, index) => {
                return(
                <button
                  className={`${getOptionClass(option)} custom-1-3 anim`}
                  key={index}
                  onClick={() => HandleGuess(option)}
                  disabled={hasAnswered}
                >
                  {option.name.common}
                </button>
                )
              })}
            </div>

            <div className="absolute bottom-2 w-full max-w-4xl mt-8 flex flex-col justify-between sm:flex-row sm:items-center sm:justify-between gap-3 pb-4">
              <div>
                {guessPending && (
                  <p className="text-zinc-500">Waiting for the host to confirm your answer...</p>
                )}
                {hasAnswered && !guessPending && (
                  <div>
                    {isCorrectGuess
                      ? <h1 className="text-green-500 font-bold">✅ Nice job! You guessed correctly.</h1>
                      : <h1 className="text-rose-500 font-bold">❌ Wrong guess. Correct answer: {currentCountry.name?.common}</h1>}
                  </div>
                )}
                {!isHost && (
                  <p className="text-xs text-zinc-500">Only the host can advance to the next flag.</p>
                )}
              </div>
              <button
                className="p-2 rounded-md bg-blue-500 text-white disabled:opacity-50"
                onClick={HandleNextFlag}
                disabled={!hasAnswered || !isHost}
              >
                Next Flag
              </button>
            </div>
        </div>
      )}
      {GameState === 'end' && (
        <div className='flex-1 flex items-center justify-center px-4'>
          <div className='w-full max-w-lg text-center border border-zinc-300 rounded-xl p-6 sm:p-8'>
            <h1 className='text-2xl font-bold'>Game complete!</h1>
            <p className='mt-3 text-zinc-600'>
              You reached {TARGET_SCORE} correct answers.
            </p>
            {isHost ? (
              <button
                className='mt-6 p-2 rounded-md bg-blue-500 text-white'
                onClick={HandlePlayAgain}
              >
                Play Again
              </button>
            ) : (
              <p className="mt-6 text-zinc-500">Waiting for the host to restart the game.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App;
