import React from "react";
import "./CartItemCard.css";
import { Link } from "react-router-dom";

const CartItemCard = ({ item, deleteCartItems }) => {
  return (
    <div className="CartItemCard">
      <img src={item.image} alt="ssa" />
      <div>
        <Link to={`/product/${item.product}`}>{item.name}</Link>
        <span>{`Preço: R$${item.price}`}</span>
        <button onClick={() => deleteCartItems(item.product)}>Remover</button>
      </div>
    </div>
  );
};

export default CartItemCard;
