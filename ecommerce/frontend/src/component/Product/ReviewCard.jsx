import React from 'react'
import Rating from "@mui/material/Rating";
import profileSvg from "../../images/usuario.svg"

const ReviewCard = ({ review }) => {

    return (
    <div className="reviewCard">
        <img src={profileSvg} alt="User" />
        <p>{review.name}</p>
        <Rating readOnly precision={0.5} value={Number(review.rating) || 0} aria-label="Avaliacao" sx={{ color: 'tomato', fontSize: { xs: 20, sm: 25 } }} />
        <span>{review.comment}</span>
    </div>
  );
};

export default ReviewCard;