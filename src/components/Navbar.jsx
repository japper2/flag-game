const Navbar = ({score}) => {
  return (
    <div class='p-8'>
      <h1 class='text-xl font-bold'>🌍 Flag Guessing Game</h1>
      <h3 className="text-zinc-500 ">Choose the correct country for the flag.</h3>
      <h1 class='absolute right-8 top-8'>Score: {score}/20</h1>
    </div>
  );
};

export default Navbar;
