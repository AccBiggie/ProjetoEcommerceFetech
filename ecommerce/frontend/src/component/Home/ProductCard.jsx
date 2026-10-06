import React, { Fragment, useState, useEffect } from 'react'
import { Link } from "react-router";
import Rating from "@mui/material/Rating";
import "./Home.css"
import { useDispatch } from 'react-redux';
import { useAlert } from "../../utils/alerts.js";
import { addItemsToCart } from '../../actions/cartAction';
import { getErrorMessage } from '../../utils/api';

const ProductCard = ({ product }) => {
  const dispatch = useDispatch();
  const alert = useAlert();
  const [adding, setAdding] = useState(false);
  const addToCart = async () => {
    setAdding(true);
    try { await dispatch(addItemsToCart(product._id, 1)); alert.success("Produto adicionado ao carrinho."); }
    catch (error) { alert.error(getErrorMessage(error)); }
    finally { setAdding(false); }
  };

  /* Contador regressivo de promoções*/
  const [timerDays, setTimerDays] = useState();
  const [timerHours, setTimerHours] = useState();
  const [timerMinutes, setTimerMinute] = useState();
  const [timerSeconds, setTimerSeconds] = useState();
  
  useEffect(() => {
    const countDownDate = new Date(product.countDown).getTime();
    const updateTimer = () => {
      const remaining = countDownDate - Date.now();
      const distance = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
      const days = Math.floor(distance / (24 * 60 * 60 * 1000));
      const hours = Math.floor((distance % (24 * 60 * 60 * 1000)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (60 * 60 * 1000)) / (1000 * 60));
      const seconds = Math.floor((distance % (60 * 1000)) / 1000);

      setTimerDays(days);
      setTimerHours(hours);
      setTimerMinute(minutes);
      setTimerSeconds(seconds);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [product.countDown]);

  return (
    <Fragment>
      <div id="product">
        <Link className="productCard" to={`/product/${product._id}`}>
          <div className="contadorPromocao" alt="contadorPromocao" >
            <span className="OFF">{product.off}% OFF</span>
              <div className="countOffProduct">
                <div>
                    <p>{timerDays}</p>
                    <small>Dias</small>
                </div>{" "}
                <div>
                    <p>{timerHours}</p>
                    <small>HRs</small>
                </div>{" "}
                <div>
                    <p>{timerMinutes}</p>
                    <small>Min.</small>
                </div>
                <div>
                    <p>{timerSeconds}</p>
                    <small>Seg.</small>
                </div>
            </div>
            <div className="countExpire">Teste</div>
          </div>
          <img src={product.images[0]?.url || "/Profile.png"} alt={product.name} />
          <p className="productName">{product.name}</p>
          <div>
            <Rating readOnly precision={0.5} value={Number(product.ratings) || 0} aria-label="Avaliacao" sx={{ color: 'tomato', fontSize: { xs: 20, sm: 25 } }} />{" "}
            <span>({product.numOfReviews} Reviews)</span>
          </div>
          <span className="oldPrice">De {`R$ ${product.oldPrice}`} por</span>
          <span className="productPrice">{`R$ ${product.price}`} Preço à vista.</span>
          <span className="installmmentPrice">ou em 12x de {` R$ ${product.installmmentPrice}`} sem juros.</span>
        </Link>
        <button className="buttomCard" onClick={addToCart} disabled={adding || product.Stock < 1}>Adicionar ao Carrinho</button>
      </div>
    </Fragment>
  );
};

export default ProductCard;
