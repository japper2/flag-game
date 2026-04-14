import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import "./App.css";
import Navbar from "./components/Navbar.jsx"

function App() {
  const TARGET_SCORE = 20
  const [Score, SetScore] = useState(0)
  const [CountryData, setCountryData] = useState([])
  const [GameState, SetGameState] = useState('begin')
  const [currentCountry, SetCurrentCountry] = useState({})
  const [GuessOptions, SetGuessOptions] = useState([])
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [hasAnswered, setHasAnswered] = useState(false)
  const [isCorrectGuess, setIsCorrectGuess] = useState(false)
  const gameContentRef = useRef(null)

  useEffect(() => {
    if (GameState !== 'game' || !gameContentRef.current || !currentCountry?.cca3) {
      return
    }

    gsap.fromTo(
      gameContentRef.current,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }
    )
  }, [GameState, currentCountry])

  const GameStart = async () => {
    try {
      const res = await fetch("https://restcountries.com/v3.1/all?fields=name,flags,cca3")
      const data = await res.json()

      setCountryData(data)
      ConstructGuess(data)
      SetGameState('game')
    } catch (error) {
      console.error("Failed to fetch countries:", error)
    }
  }

  function getRandomIntInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  const ConstructGuess = (countries) => {
    if (!countries || countries.length === 0) {
      return
    }

    const randomIndex = getRandomIntInclusive(0, countries.length - 1)
    const correctCountry = countries[randomIndex]
    const extraOptionsTarget = 5
    const extraCountries = []

    while (extraCountries.length < extraOptionsTarget) {
      const randomCountry = countries[getRandomIntInclusive(0, countries.length - 1)]

      if (randomCountry !== correctCountry && !extraCountries.includes(randomCountry)) {
        extraCountries.push(randomCountry)
      }
    }

    const options = [correctCountry, ...extraCountries]

    // Shuffle so the correct answer is not always first.
    for (let i = options.length - 1; i > 0; i--) {
      const j = getRandomIntInclusive(0, i)
      const temp = options[i]
      options[i] = options[j]
      options[j] = temp
    }

    SetCurrentCountry(correctCountry)
    SetGuessOptions(options)
    setSelectedCountry(null)
    setHasAnswered(false)
    setIsCorrectGuess(false)
    console.log(correctCountry)
  }

  const HandleGuess = (option) => {
    if (hasAnswered) {
      return
    }

    const correct = option.cca3 === currentCountry.cca3
    setSelectedCountry(option)
    setHasAnswered(true)
    setIsCorrectGuess(correct)

    if (correct) {
      SetScore(prevScore => {
        const nextScore = prevScore + 1
        if (nextScore >= TARGET_SCORE) {
          SetGameState('end')
        }
        return nextScore
      })
    }
  }

  const HandleNextFlag = () => {
    ConstructGuess(CountryData)
  }

  const HandlePlayAgain = () => {
    SetScore(0)
    if (CountryData.length > 0) {
      ConstructGuess(CountryData)
      SetGameState('game')
      return
    }

    GameStart()
  }

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

  return (
    <div className='min-h-screen flex flex-col overflow-hidden'>
      <Navbar score={Score} />


      {GameState === 'begin' && (
        <div className='flex-1 flex items-center justify-center px-4'>
          <button className="border border-zinc-300 rounded-md p-2 bg-zinc-100" onClick={() => GameStart()}>Start Game</button>
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
              {hasAnswered && (
                <div>
                  {isCorrectGuess
                    ? <h1 className="text-green-500 font-bold">✅ Nice job! You guessed correctly.</h1>
                    : <h1 className="text-rose-500 font-bold">❌ Wrong guess. Correct answer: {currentCountry.name?.common}</h1>}
                </div>
              )}
              <div>{}</div>
              <button
                className="p-2 rounded-md bg-blue-500 text-white disabled:opacity-50"
                onClick={HandleNextFlag}
                disabled={!hasAnswered}
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
            <button
              className='mt-6 p-2 rounded-md bg-blue-500 text-white'
              onClick={HandlePlayAgain}
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App;
